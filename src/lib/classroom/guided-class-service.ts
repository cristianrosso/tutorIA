import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/models";
import { retrieveAcademicContext } from "@/lib/knowledge/rag";
import { generateTutorText } from "@/lib/ai/openai";
import { estimateTextCost } from "@/lib/ai/costs";
import { recordAIUsage } from "@/lib/billing/ai-usage";
import { buildAdaptiveTutorContext } from "@/lib/adaptive/recommendation-engine";
import { buildStudentMemoryContext } from "@/lib/learning/memory-context";
import type { KnowledgeChunkCandidate } from "@/lib/knowledge/types";

export type GuidedClassMode = "topic" | "unit" | "reinforcement";
export type GuidedPedagogicalMode = "simple" | "academic" | "deep" | "review";
export type GuidedInteractionMode = "text" | "voice" | "mixed";
export type GuidedClassStatus =
  | "draft"
  | "ready"
  | "in_progress"
  | "awaiting_student_answer"
  | "feedback"
  | "paused"
  | "completed"
  | "cancelled"
  | "error";

type Source = KnowledgeChunkCandidate;

export type GuidedClassStep = {
  id: string;
  stepOrder: number;
  stepType: string;
  title: string;
  content: string;
  checkQuestion?: string | null;
  expectedAnswer?: string | null;
  status: string;
  sourceReferences: unknown[];
};

export type GuidedClassSessionView = {
  id: string;
  unitNumber: number;
  topicLabel: string | null;
  classMode: GuidedClassMode;
  pedagogicalMode: GuidedPedagogicalMode;
  interactionMode: GuidedInteractionMode;
  status: GuidedClassStatus;
  currentStep: number;
  estimatedDurationMinutes: number;
  objectives: string[];
  sourceSummary: unknown;
  completedSteps: number;
  totalSteps: number;
  steps: GuidedClassStep[];
};

export async function getClassroomCatalog() {
  const db = createSupabaseAdmin();
  const [{ data: units }, { data: topics }] = await Promise.all([
    db
      .from("units")
      .select("id,number,name,enabled")
      .order("number", { ascending: true }),
    db
      .from("academic_topics")
      .select(
        "id,topic_number,topic_name,sequence_index,academic_units(unit_number,unit_name)",
      )
      .order("sequence_index", { ascending: true })
      .limit(600),
  ]);
  return {
    units: (units || []).map((unit) => ({
      id: unit.id as string,
      number: Number(unit.number),
      name: unit.name as string,
      enabled: Boolean(unit.enabled),
    })),
    topics: (topics || []).map((topic) => {
      const academicUnit = Array.isArray(topic.academic_units)
        ? topic.academic_units[0]
        : topic.academic_units;
      return {
        id: topic.id as string,
        unitNumber: Number(academicUnit?.unit_number || 0),
        unitName: String(academicUnit?.unit_name || ""),
        number: (topic.topic_number as string | null) || "",
        name: topic.topic_name as string,
      };
    }),
  };
}

export async function startGuidedClass(
  profile: Profile,
  input: {
    unitNumber: number;
    topicId?: string | null;
    topicLabel?: string | null;
    classMode: GuidedClassMode;
    pedagogicalMode: GuidedPedagogicalMode;
    interactionMode: GuidedInteractionMode;
    estimatedDurationMinutes: number;
  },
) {
  const db = createSupabaseAdmin();
  const unitNumber = Math.min(15, Math.max(1, Number(input.unitNumber) || 1));
  const topicLabel = sanitizeTopic(input.topicLabel || "");
  const query = buildClassQuery(unitNumber, topicLabel, input.classMode);
  const [academic, memoryContext, adaptiveContext] = await Promise.all([
    retrieveAcademicContext(query, {
      unitNumber,
      maxChunks: 5,
      maxContextTokens: 1700,
    }),
    buildStudentMemoryContext({ userId: profile.id, currentQuery: query }),
    buildAdaptiveTutorContext({ userId: profile.id, limit: 3 }),
  ]);
  if (!academic.context.trim() || academic.sources.length === 0) {
    throw new Error(
      "No hay contenido suficiente del compendio para iniciar esta clase guiada.",
    );
  }
  const objectives = generateLearningObjectives({
    topicLabel:
      topicLabel || academic.sources[0]?.topicName || "tema seleccionado",
    sources: academic.sources,
    mode: input.classMode,
  });
  const intro = await generateClassStepText({
    stepType: "introduction",
    title: titleForClass(topicLabel, unitNumber),
    query,
    context: academic.context,
    objectives,
    pedagogicalMode: input.pedagogicalMode,
    memoryContext,
    adaptiveContext,
  });
  const academicUnitId = await findAcademicUnitId(unitNumber);
  const { data: session, error } = await db
    .from("guided_class_sessions")
    .insert({
      user_id: profile.id,
      unit_id: academicUnitId,
      topic_id: input.topicId || null,
      unit_number: unitNumber,
      topic_label: topicLabel || null,
      class_mode: input.classMode,
      pedagogical_mode: input.pedagogicalMode,
      interaction_mode: input.interactionMode,
      status: "in_progress",
      current_step: 1,
      estimated_duration_minutes: input.estimatedDurationMinutes,
      objectives,
      source_summary: {
        sources: academic.sources.slice(0, 5).map(toSourceReference),
        query,
      },
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !session) throw new Error("No se pudo crear la clase guiada.");
  const sessionId = session.id as string;
  await db.from("guided_class_steps").insert({
    class_session_id: sessionId,
    knowledge_object_id: academic.sources[0]?.knowledgeObjectId || null,
    step_order: 1,
    step_type: "introduction",
    title: titleForClass(topicLabel, unitNumber),
    content: intro.text,
    source_references: academic.sources.slice(0, 5).map(toSourceReference),
    status: "shown",
  });
  await db.from("guided_class_progress").insert({
    class_session_id: sessionId,
    user_id: profile.id,
    completed_steps: 0,
    total_steps: targetSteps(input.estimatedDurationMinutes),
  });
  await recordAIUsage({
    userId: profile.id,
    operationId: `guided-class-start:${sessionId}`,
    operationType: "guided_class",
    model: intro.model,
    inputTokens: intro.inputTokens,
    outputTokens: intro.outputTokens,
    estimatedCostUsd: estimateTextCost(intro.inputTokens, intro.outputTokens),
    costIsEstimated: false,
  });
  return getGuidedClassSession(profile, sessionId);
}

export async function getGuidedClassSession(
  profile: Profile,
  sessionId: string,
) {
  const db = createSupabaseAdmin();
  const [{ data: session, error }, { data: steps }, { data: progress }] =
    await Promise.all([
      db
        .from("guided_class_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("user_id", profile.id)
        .single(),
      db
        .from("guided_class_steps")
        .select("*")
        .eq("class_session_id", sessionId)
        .order("step_order", { ascending: true }),
      db
        .from("guided_class_progress")
        .select("completed_steps,total_steps")
        .eq("class_session_id", sessionId)
        .maybeSingle(),
    ]);
  if (error || !session) throw new Error("No se encontró la clase guiada.");
  return toSessionView(session, steps || [], progress);
}

export async function advanceGuidedClass(profile: Profile, sessionId: string) {
  const current = await getGuidedClassSession(profile, sessionId);
  if (["completed", "cancelled"].includes(current.status)) return current;
  const nextOrder = current.steps.length + 1;
  if (nextOrder > current.totalSteps)
    return completeGuidedClass(profile, sessionId);
  const stepType = stepTypeForOrder(nextOrder, current.totalSteps);
  const db = createSupabaseAdmin();
  const query = buildClassQuery(
    current.unitNumber,
    current.topicLabel || "",
    current.classMode,
  );
  const academic = await retrieveAcademicContext(
    `${query}\nEtapa: ${stepType}`,
    {
      unitNumber: current.unitNumber,
      maxChunks: 4,
      maxContextTokens: 1500,
    },
  );
  const generated = await generateClassStepText({
    stepType,
    title: titleForStep(stepType, current.topicLabel, nextOrder),
    query,
    context: academic.context,
    objectives: current.objectives,
    pedagogicalMode: current.pedagogicalMode,
  });
  const checkQuestion =
    stepType === "check_question" ? generated.checkQuestion : null;
  const { error } = await db.from("guided_class_steps").insert({
    class_session_id: sessionId,
    knowledge_object_id: academic.sources[0]?.knowledgeObjectId || null,
    step_order: nextOrder,
    step_type: stepType,
    title: titleForStep(stepType, current.topicLabel, nextOrder),
    content: generated.text,
    check_question: checkQuestion,
    expected_answer: generated.expectedAnswer,
    source_references: academic.sources.slice(0, 4).map(toSourceReference),
    status: stepType === "check_question" ? "awaiting_answer" : "shown",
  });
  if (error) throw new Error("No se pudo avanzar la clase.");
  await db
    .from("guided_class_sessions")
    .update({
      current_step: nextOrder,
      status:
        stepType === "check_question"
          ? "awaiting_student_answer"
          : "in_progress",
    })
    .eq("id", sessionId)
    .eq("user_id", profile.id);
  await db
    .from("guided_class_progress")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("class_session_id", sessionId);
  await recordAIUsage({
    userId: profile.id,
    operationId: `guided-class-step:${sessionId}:${nextOrder}`,
    operationType: "guided_class",
    model: generated.model,
    inputTokens: generated.inputTokens,
    outputTokens: generated.outputTokens,
    estimatedCostUsd: estimateTextCost(
      generated.inputTokens,
      generated.outputTokens,
    ),
    costIsEstimated: false,
  });
  return getGuidedClassSession(profile, sessionId);
}

export async function answerGuidedClassStep(
  profile: Profile,
  sessionId: string,
  input: { stepId: string; answer: string; inputMode?: "text" | "voice" },
) {
  const db = createSupabaseAdmin();
  const session = await getGuidedClassSession(profile, sessionId);
  const step = session.steps.find((item) => item.id === input.stepId);
  if (!step) throw new Error("No se encontró la pregunta de comprobación.");
  const feedback = await generateTutorText({
    model: process.env.OPENAI_FAST_MODEL || "gpt-5.6-luna",
    maxOutputTokens: 360,
    system:
      "Eres un tutor académico de FATESCIPOL. Evalúas una respuesta breve usando solo el contenido esperado y das retroalimentación formativa concreta.",
    user: `Pregunta de comprobación: ${step.checkQuestion || step.title}\nRespuesta esperada orientativa: ${step.expectedAnswer || step.content}\nRespuesta del estudiante: ${input.answer}\nResponde con: acierto principal, corrección necesaria, explicación breve y siguiente acción. No inventes datos externos.`,
  });
  await db.from("guided_class_interactions").insert({
    class_session_id: sessionId,
    step_id: step.id,
    user_id: profile.id,
    interaction_type: "student_answer",
    input_mode: input.inputMode || "text",
    student_message: input.answer,
    tutor_response: feedback.text,
  });
  await db
    .from("guided_class_steps")
    .update({ status: "answered" })
    .eq("id", step.id);
  await db
    .from("guided_class_sessions")
    .update({ status: "feedback" })
    .eq("id", sessionId)
    .eq("user_id", profile.id);
  await db
    .from("guided_class_progress")
    .update({
      completed_steps: Math.min(session.totalSteps, session.completedSteps + 1),
      last_activity_at: new Date().toISOString(),
    })
    .eq("class_session_id", sessionId);
  await recordAIUsage({
    userId: profile.id,
    operationId: `guided-class-feedback:${sessionId}:${step.id}`,
    operationType: "guided_class_feedback",
    model: feedback.model,
    inputTokens: feedback.inputTokens,
    outputTokens: feedback.outputTokens,
    estimatedCostUsd: estimateTextCost(
      feedback.inputTokens,
      feedback.outputTokens,
    ),
    costIsEstimated: false,
  });
  return {
    ...(await getGuidedClassSession(profile, sessionId)),
    feedback: feedback.text,
  };
}

export async function pauseGuidedClass(profile: Profile, sessionId: string) {
  const { error } = await createSupabaseAdmin()
    .from("guided_class_sessions")
    .update({ status: "paused", paused_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", profile.id);
  if (error) throw new Error("No se pudo pausar la clase.");
  return getGuidedClassSession(profile, sessionId);
}

export async function resumeGuidedClass(profile: Profile, sessionId: string) {
  const { error } = await createSupabaseAdmin()
    .from("guided_class_sessions")
    .update({ status: "in_progress", paused_at: null })
    .eq("id", sessionId)
    .eq("user_id", profile.id);
  if (error) throw new Error("No se pudo reanudar la clase.");
  return getGuidedClassSession(profile, sessionId);
}

export async function completeGuidedClass(profile: Profile, sessionId: string) {
  const db = createSupabaseAdmin();
  await db
    .from("guided_class_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", profile.id);
  await db.from("guided_class_interactions").insert({
    class_session_id: sessionId,
    user_id: profile.id,
    interaction_type: "complete",
    input_mode: "text",
    tutor_response:
      "Clase completada. La síntesis se basa en las etapas realizadas.",
  });
  return getGuidedClassSession(profile, sessionId);
}

function generateLearningObjectives(input: {
  topicLabel: string;
  sources: Source[];
  mode: GuidedClassMode;
}) {
  const concept = cleanTitle(input.topicLabel);
  const hasProcedure = input.sources.some((source) =>
    /PROCEDURE|PASO|FASE/i.test(
      `${source.title || ""} ${source.content || ""} ${source.sourceText || ""}`,
    ),
  );
  const base = [
    `Comprender el concepto central de ${concept}.`,
    `Identificar los elementos principales respaldados por el compendio.`,
    `Explicar la importancia del tema con palabras propias.`,
  ];
  if (hasProcedure)
    base.push("Ordenar las fases o pasos cuando el contenido lo requiera.");
  if (input.mode === "reinforcement")
    base.push("Corregir confusiones detectadas en prácticas anteriores.");
  base.push(
    "Aplicar el contenido a una situación policial o institucional sencilla.",
  );
  return base.slice(0, 5);
}

async function generateClassStepText(input: {
  stepType: string;
  title: string;
  query: string;
  context: string;
  objectives: string[];
  pedagogicalMode: GuidedPedagogicalMode;
  memoryContext?: string;
  adaptiveContext?: string;
}) {
  const completion = await generateTutorText({
    model: process.env.OPENAI_FAST_MODEL || "gpt-5.6-luna",
    maxOutputTokens: input.stepType === "check_question" ? 360 : 560,
    system:
      "Eres un profesor experto de FATESCIPOL. Diseñas una clase guiada incremental, fiel al compendio. No inventes contenido oficial.",
    user: `Etapa de clase: ${input.stepType}\nTítulo: ${input.title}\nConsulta académica: ${input.query}\nModo pedagógico: ${input.pedagogicalMode}\nObjetivos:\n- ${input.objectives.join("\n- ")}\nMemoria del estudiante:\n${input.memoryContext || "Sin memoria suficiente."}\nContexto adaptativo:\n${input.adaptiveContext || "Sin recomendaciones activas."}\nContenido del compendio:\n${input.context}\n\nInstrucciones:\n- Genera solo esta etapa, no toda la clase.\n- Diferencia contenido oficial, explicación y ejemplo si corresponde.\n- Si es pregunta de comprobación, incluye una pregunta abierta natural y una respuesta esperada orientativa.\n- Redacta en español natural, claro y breve.`,
  });
  return {
    text: completion.text,
    checkQuestion: extractCheckQuestion(completion.text),
    expectedAnswer: extractExpectedAnswer(completion.text),
    model: completion.model,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
  };
}

async function findAcademicUnitId(unitNumber: number) {
  const { data } = await createSupabaseAdmin()
    .from("academic_units")
    .select("id")
    .eq("unit_number", unitNumber)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) || null;
}

function buildClassQuery(
  unitNumber: number,
  topic: string,
  mode: GuidedClassMode,
) {
  const base = topic ? `${topic} Unidad ${unitNumber}` : `Unidad ${unitNumber}`;
  if (mode === "reinforcement")
    return `${base} refuerzo conceptos principales dificultades frecuentes`;
  if (mode === "unit")
    return `${base} conceptos principales objetivos explicación ejemplo pregunta de comprobación`;
  return `${base} concepto explicación ejemplo aplicación`;
}

function targetSteps(minutes: number) {
  if (minutes <= 15) return 4;
  if (minutes <= 30) return 6;
  if (minutes <= 45) return 8;
  return 10;
}

function stepTypeForOrder(order: number, total: number) {
  if (order === total) return "summary";
  if (order % 3 === 0) return "check_question";
  if (order % 2 === 0) return "explanation";
  return "example";
}

function titleForClass(topic: string, unitNumber: number) {
  return topic
    ? `Clase guiada: ${cleanTitle(topic)}`
    : `Clase guiada: Unidad ${unitNumber}`;
}

function titleForStep(stepType: string, topic: string | null, order: number) {
  const label = topic ? cleanTitle(topic) : "tema seleccionado";
  if (stepType === "explanation") return `Explicación ${order}: ${label}`;
  if (stepType === "example") return `Ejemplo aplicado: ${label}`;
  if (stepType === "check_question") return `Pregunta de comprobación`;
  if (stepType === "summary") return `Síntesis final`;
  return `Etapa ${order}`;
}

function toSourceReference(source: Source) {
  return {
    knowledgeObjectId: source.knowledgeObjectId,
    unitNumber: source.unitNumber,
    unitName: source.unitName,
    topicName: source.topicName,
    sectionName: source.sectionName,
    reference: source.sourceReference || source.pageReference,
    score: source.finalScore,
  };
}

function toSessionView(
  session: Record<string, unknown>,
  steps: Record<string, unknown>[],
  progress: Record<string, unknown> | null,
): GuidedClassSessionView {
  return {
    id: session.id as string,
    unitNumber: Number(session.unit_number),
    topicLabel: session.topic_label as string | null,
    classMode: session.class_mode as GuidedClassMode,
    pedagogicalMode: session.pedagogical_mode as GuidedPedagogicalMode,
    interactionMode: session.interaction_mode as GuidedInteractionMode,
    status: session.status as GuidedClassStatus,
    currentStep: Number(session.current_step || 0),
    estimatedDurationMinutes: Number(session.estimated_duration_minutes || 30),
    objectives: Array.isArray(session.objectives)
      ? (session.objectives as string[])
      : [],
    sourceSummary: session.source_summary || {},
    completedSteps: Number(progress?.completed_steps || 0),
    totalSteps: Number(
      progress?.total_steps ||
        targetSteps(Number(session.estimated_duration_minutes || 30)),
    ),
    steps: steps.map((step) => ({
      id: step.id as string,
      stepOrder: Number(step.step_order),
      stepType: step.step_type as string,
      title: step.title as string,
      content: step.content as string,
      checkQuestion: step.check_question as string | null,
      expectedAnswer: step.expected_answer as string | null,
      status: step.status as string,
      sourceReferences: Array.isArray(step.source_references)
        ? (step.source_references as unknown[])
        : [],
    })),
  };
}

function sanitizeTopic(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function cleanTitle(value: string) {
  return (
    sanitizeTopic(value).replace(/^\d+(?:\.\d+)*\s*[.-]?\s*/, "") ||
    "tema seleccionado"
  );
}

function extractCheckQuestion(text: string) {
  const match = text.match(
    /(?:pregunta(?: de comprobaci[oó]n)?|comprobaci[oó]n)[:\-]?\s*(.+?)(?:\n|$)/i,
  );
  return match?.[1]?.trim() || null;
}

function extractExpectedAnswer(text: string) {
  const match = text.match(
    /(?:respuesta esperada|respuesta orientativa)[:\-]?\s*([\s\S]+)$/i,
  );
  return match?.[1]?.trim().slice(0, 900) || null;
}
