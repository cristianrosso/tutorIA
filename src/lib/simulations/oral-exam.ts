import "server-only";
import { EXAMINER_SYSTEM_PROMPT } from "@/prompts/examiner-system";
import { generateTutorText, estimateTokens } from "@/lib/ai/openai";
import { estimateTextCost } from "@/lib/ai/costs";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { retrieveContext, type RetrievedSource } from "@/lib/rag/retrieve";
import type { Profile } from "@/lib/models";
import { unitName } from "@/lib/units";
import { recordUnitProgress } from "@/lib/progress";

export type SimulationDifficulty = "basico" | "intermedio" | "avanzado";
export type SimulationLength = "rapido" | "completo";
export type QuestionType =
  | "definition"
  | "explanation"
  | "enumeration"
  | "comparison"
  | "application"
  | "follow_up"
  | "conceptual"
  | "comprehension";
export type RubricScore = {
  conceptual: number;
  application: number;
  terminology: number;
  argumentation: number;
  clarity: number;
  total: number;
};
export type AnswerEvaluation = {
  score: RubricScore;
  strengths: string[];
  missingConcepts: string[];
  misconceptions: string[];
  improvements: string[];
  needsFollowUp: boolean;
  followUpReason: string;
  feedback: string;
  correctAnswer: string;
  didacticExplanation: string;
  didacticExample: string;
  policeApplication: string;
  modelAnswer: string;
};
export type SourceMetadata = {
  index: number;
  chunk_id: string;
  document_id: string;
  title: string;
  source: string;
  version: string;
  section: string | null;
  section_name: string | null;
  page: number | null;
  score: number;
};
export type ExamQuestion = {
  question: string;
  questionType: QuestionType;
  difficulty: SimulationDifficulty;
  expectedConcepts: string[];
  sourceReferences: SourceMetadata[];
};
export type SimulationQuestion = {
  id: string;
  position: number;
  question: string;
  question_type: QuestionType;
  answer: string | null;
  transcription: string | null;
  parent_question_id: string | null;
  score: number | null;
  feedback: AnswerEvaluation | null;
  expected_concepts: string[];
  missing_concepts: string[];
  source_references: SourceMetadata[];
  model_answer: string | null;
};
export type ErrorReview = {
  question: string;
  studentAnswer: string;
  whatWasGood: string[];
  whatWasMissing: string[];
  conceptToCorrect: string;
  betterExplanation: string;
  didacticExample: string;
};
export type SimulationResult = {
  conceptual: number;
  terminology: number;
  application: number;
  argumentation: number;
  clarity: number;
  total: number;
  strengths: string[];
  improvements: string[];
  suggested_answer: string;
  review_topics: string[];
  concepts_omitted: string[];
  model_answers: Array<{ question: string; answer: string }>;
  error_reviews: ErrorReview[];
  cost_estimated: number | null;
  disclaimer: string;
};
export type SimulationState = {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  difficulty: SimulationDifficulty;
  unit_number: number;
  unit_name: string;
  question_count: number;
  main_answered: number;
  progress_label: string;
  session_id: string | null;
  questions: SimulationQuestion[];
  result: SimulationResult | null;
};

function starterQuery(unitNumber: number) {
  return `${unitName(unitNumber)} definicion conceptos principios procedimiento clasificacion aplicacion funcion policial examen oral`;
}
const disclaimer =
  "Esta evaluación es una herramienta de práctica y no constituye una calificación oficial de FATESCIPOL.";

export async function startOralSimulation(
  profile: Profile,
  input: {
    difficulty?: SimulationDifficulty;
    length?: SimulationLength;
    unitNumber?: number;
  } = {},
) {
  const difficulty = input.difficulty || "intermedio";
  const questionCount = input.length === "completo" ? 5 : 3;
  const unitNumber = Math.min(15, Math.max(1, input.unitNumber || 1));
  const db = createSupabaseAdmin();
  const { data: unit, error: unitError } = await db
    .from("units")
    .select("id,number,name")
    .eq("number", unitNumber)
    .single();
  if (unitError || !unit) throw new Error("No se encontró la unidad.");
  const sources = await retrieveContext(starterQuery(unitNumber), unitNumber);
  assertSufficientContext(sources);
  await db
    .from("simulations")
    .update({ status: "abandoned", ended_at: new Date().toISOString() })
    .eq("user_id", profile.id)
    .eq("status", "in_progress");
  const sessionResult = await db
    .from("study_sessions")
    .insert({ user_id: profile.id, unit_id: unit.id, mode: "simulation" })
    .select("id")
    .single();
  if (sessionResult.error || !sessionResult.data)
    throw new Error("No se pudo crear la sesión del simulacro.");
  const { data: simulation, error: simulationError } = await db
    .from("simulations")
    .insert({
      user_id: profile.id,
      unit_id: unit.id,
      session_id: sessionResult.data.id,
      status: "in_progress",
      difficulty,
      question_count: questionCount,
      metadata: { unit: unit.name, unit_number: unit.number, sprint: 5 },
    })
    .select("id")
    .single();
  if (simulationError || !simulation)
    throw new Error("No se pudo iniciar el simulacro.");
  const firstQuestion = await generateExamQuestion({
    difficulty,
    previousQuestions: [],
    studentPerformance: "Inicio del simulacro.",
    retrievedContext: sources,
  });
  await insertQuestion({
    simulationId: simulation.id as string,
    position: 1,
    examQuestion: firstQuestion,
  });
  await db.from("messages").insert({
    session_id: sessionResult.data.id,
    role: "assistant",
    content: firstQuestion.question,
    retrieved_sources: firstQuestion.sourceReferences,
  });
  await recordChatUsage({
    profileId: profile.id,
    sessionId: sessionResult.data.id,
    simulationId: simulation.id as string,
    model: "structured-fallback",
    inputTokens: estimateTokens(sourceBlock(sources)),
    outputTokens: estimateTokens(firstQuestion.question),
    requestId: null,
  });
  return readSimulation(profile, simulation.id as string);
}

export async function readLatestSimulation(profile: Profile) {
  const { data } = await createSupabaseAdmin()
    .from("simulations")
    .select("id")
    .eq("user_id", profile.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? readSimulation(profile, data.id as string) : null;
}
export async function submitOralAnswer(input: {
  profile: Profile;
  simulationId: string;
  answer: string;
}) {
  const db = createSupabaseAdmin();
  const state = await readSimulation(input.profile, input.simulationId);
  if (!state || state.status !== "in_progress")
    throw new Error("No hay un simulacro activo.");
  const current = state.questions.find((question) => !question.answer);
  if (!current) throw new Error("No hay pregunta pendiente.");
  const answer = input.answer.trim();
  const sources = await retrieveContext(
    `${current.question}\n${answer}`,
    state.unit_number,
  );
  assertSufficientContext(sources);
  const evaluation = await evaluateStudentAnswer({
    question: current,
    studentAnswer: answer,
    retrievedContext: sources,
    difficulty: state.difficulty,
  });
  await db
    .from("simulation_questions")
    .update({
      answer,
      transcription: answer,
      score: evaluation.score.total,
      feedback: evaluation,
      missing_concepts: evaluation.missingConcepts,
      source_references: sourcesToMetadata(sources),
      model_answer: evaluation.modelAnswer,
    })
    .eq("id", current.id);
  if (state.session_id) {
    await db.from("messages").insert({
      session_id: state.session_id,
      role: "user",
      content: answer,
    });
  }
  const refreshed = await readSimulation(input.profile, state.id);
  const nextPosition = refreshed.questions.length + 1;
  if (shouldAskFollowUp(current, evaluation, refreshed.questions)) {
    const followUp = await generateFollowUpQuestion({
      previousQuestion: current,
      studentAnswer: answer,
      evaluation,
      retrievedContext: sources,
      difficulty: state.difficulty,
    });
    await insertQuestion({
      simulationId: state.id,
      position: nextPosition,
      examQuestion: followUp,
      parentQuestionId: current.id,
    });
    if (state.session_id) {
      await db.from("messages").insert({
        session_id: state.session_id,
        role: "assistant",
        content: followUp.question,
        retrieved_sources: followUp.sourceReferences,
      });
    }
    return readSimulation(input.profile, state.id);
  }
  if (countAnsweredMainQuestions(refreshed.questions) < state.question_count) {
    const nextSources = await retrieveContext(
      nextQuestionQuery(refreshed),
      state.unit_number,
    );
    assertSufficientContext(nextSources);
    const nextQuestion = await generateExamQuestion({
      difficulty: adaptDifficulty(state.difficulty, refreshed.questions),
      previousQuestions: refreshed.questions.map(
        (question) => question.question,
      ),
      studentPerformance: summarizePerformance(refreshed.questions),
      retrievedContext: nextSources,
    });
    await insertQuestion({
      simulationId: state.id,
      position: nextPosition,
      examQuestion: nextQuestion,
    });
    if (state.session_id) {
      await db.from("messages").insert({
        session_id: state.session_id,
        role: "assistant",
        content: nextQuestion.question,
        retrieved_sources: nextQuestion.sourceReferences,
      });
    }
    return readSimulation(input.profile, state.id);
  }
  await finalizeSimulation({
    profile: input.profile,
    simulationId: state.id,
    sessionId: state.session_id,
  });
  return readSimulation(input.profile, state.id);
}

export async function practiceSimulationErrors(input: {
  profile: Profile;
  simulationId: string;
}) {
  const state = await readSimulation(input.profile, input.simulationId);
  const topics = state.result?.review_topics?.length
    ? state.result.review_topics.join(" ")
    : collectMissingConcepts(state.questions).join(" ") ||
      starterQuery(state.unit_number);
  const sources = await retrieveContext(topics, state.unit_number);
  assertSufficientContext(sources);
  return generateExamQuestion({
    difficulty: "basico",
    previousQuestions: state.questions.map((item) => item.question),
    studentPerformance: "Refuerzo de errores del simulacro anterior.",
    retrievedContext: sources,
  });
}

export async function readSimulation(profile: Profile, simulationId: string) {
  const db = createSupabaseAdmin();
  const { data: simulation, error } = await db
    .from("simulations")
    .select(
      "id,status,difficulty,question_count,session_id,unit_id,units(number,name)",
    )
    .eq("id", simulationId)
    .eq("user_id", profile.id)
    .single();
  if (error || !simulation) throw new Error("No se encontró el simulacro.");
  const [{ data: questions }, { data: result }] = await Promise.all([
    db
      .from("simulation_questions")
      .select(
        "id,position,question,question_type,answer,transcription,parent_question_id,score,feedback,expected_concepts,missing_concepts,source_references,model_answer",
      )
      .eq("simulation_id", simulationId)
      .order("position"),
    db
      .from("simulation_results")
      .select(
        "conceptual,terminology,application,argumentation,clarity,total,strengths,improvements,suggested_answer,review_topics,concepts_omitted,model_answers,error_reviews,cost_estimated,disclaimer",
      )
      .eq("simulation_id", simulationId)
      .maybeSingle(),
  ]);
  const normalizedQuestions = ((questions || []) as unknown[]).map(
    normalizeQuestionRow,
  );
  const questionCount = Number(simulation.question_count || 3);
  const mainAnswered = countAnsweredMainQuestions(normalizedQuestions);
  return {
    id: simulation.id as string,
    status: simulation.status as SimulationState["status"],
    difficulty: (simulation.difficulty || "intermedio") as SimulationDifficulty,
    unit_number: Number((simulation.units as { number?: number } | null)?.number || 1),
    unit_name: String((simulation.units as { name?: string } | null)?.name || "Unidad"),
    question_count: questionCount,
    main_answered: mainAnswered,
    progress_label: `Pregunta ${Math.min(mainAnswered + 1, questionCount)} de ${questionCount}`,
    session_id: (simulation.session_id as string | null) || null,
    questions: normalizedQuestions,
    result: result ? normalizeResultRow(result) : null,
  };
}

async function finalizeSimulation(input: {
  profile: Profile;
  simulationId: string;
  sessionId: string | null;
}) {
  const db = createSupabaseAdmin();
  const state = await readSimulation(input.profile, input.simulationId);
  const answered = state.questions.filter((question) => question.answer);
  const aggregate = aggregateScores(answered);
  const strengths = uniqueStrings(
    answered.flatMap((question) => question.feedback?.strengths || []),
  ).slice(0, 5);
  const missing = collectMissingConcepts(answered).slice(0, 8);
  const improvements = uniqueStrings(
    answered.flatMap((question) => question.feedback?.improvements || []),
  ).slice(0, 6);
  const modelAnswers = answered
    .filter((question) => question.question_type !== "follow_up")
    .map((question) => ({
      question: question.question,
      answer:
        question.model_answer ||
        "Ejemplo de respuesta oral: defina el concepto, use terminología del compendio y cierre con su aplicación policial.",
    }));
  const cost = await simulationCost(input.simulationId);
  await db.from("simulation_results").upsert({
    simulation_id: input.simulationId,
    conceptual: aggregate.conceptual,
    terminology: aggregate.terminology,
    application: aggregate.application,
    argumentation: aggregate.argumentation,
    clarity: aggregate.clarity,
    strengths: strengths.length
      ? strengths
      : ["Completó el simulacro y sostuvo una respuesta oral."],
    improvements: improvements.length
      ? improvements
      : [
          "Ordenar la respuesta con concepto, explicación y aplicación policial.",
        ],
    suggested_answer:
      modelAnswers[0]?.answer ||
      "Ejemplo de una respuesta oral bien estructurada sobre la unidad estudiada.",
    review_topics: missing.length ? missing : [state.unit_name],
    concepts_omitted: missing,
    model_answers: modelAnswers,
    error_reviews: buildErrorReviews(answered),
    cost_estimated: cost,
    disclaimer,
  });
  await db
    .from("simulations")
    .update({
      status: "completed",
      ended_at: new Date().toISOString(),
      overall_score: aggregate.total,
      estimated_cost: cost,
    })
    .eq("id", input.simulationId);
  await recordUnitProgress({
    userId: input.profile.id,
    unitId: (
      await db
        .from("simulations")
        .select("unit_id")
        .eq("id", input.simulationId)
        .single()
    ).data?.unit_id as string,
    simulations: 1,
    score: aggregate.total,
    weakTopics: missing,
  });
  if (input.sessionId) {
    await db.from("messages").insert({
      session_id: input.sessionId,
      role: "assistant",
      content: `Resultado del simulacro: ${aggregate.total}/100\n\n${disclaimer}`,
    });
  }
}
export async function generateExamQuestion(input: {
  difficulty: SimulationDifficulty;
  previousQuestions: string[];
  studentPerformance: string;
  retrievedContext: RetrievedSource[];
}): Promise<ExamQuestion> {
  assertSufficientContext(input.retrievedContext);
  const fallback = fallbackQuestion(input);
  try {
    const completion = await generateTutorText({
      system: EXAMINER_SYSTEM_PROMPT,
      user: `
Genera UNA pregunta principal para simulacro de examen oral.
Devuelve JSON estricto con: question, questionType, difficulty, expectedConcepts.
Tipos permitidos: definition, explanation, enumeration, comparison, application.
Nivel: ${input.difficulty}. No reveles la respuesta. No repitas preguntas previas.

Preguntas previas:
${input.previousQuestions.map((question) => `- ${question}`).join("\n") || "Ninguna"}

Rendimiento acumulado:
${input.studentPerformance}

Contexto recuperado del compendio:
${sourceBlock(input.retrievedContext)}
`.trim(),
      maxOutputTokens: 360,
    });
    return normalizeExamQuestion(
      parseJsonObject<Partial<ExamQuestion>>(completion.text),
      fallback,
      input.retrievedContext,
      input.difficulty,
    );
  } catch {
    return fallback;
  }
}

export async function evaluateStudentAnswer(input: {
  question: SimulationQuestion;
  studentAnswer: string;
  retrievedContext: RetrievedSource[];
  difficulty: SimulationDifficulty;
}): Promise<AnswerEvaluation> {
  const heuristic = heuristicEvaluateAnswer(
    input.question.question,
    input.studentAnswer,
    input.question.expected_concepts,
  );
  try {
    const completion = await generateTutorText({
      system: EXAMINER_SYSTEM_PROMPT,
      user: `
Evalua la respuesta del estudiante contra el contexto del compendio. No evalues voz, acento ni velocidad.
Devuelve JSON estricto con esta forma:
{"score":{"conceptual":0,"application":0,"terminology":0,"argumentation":0,"clarity":0},"strengths":[],"missingConcepts":[],"misconceptions":[],"improvements":[],"needsFollowUp":true,"followUpReason":"","feedback":"","correctAnswer":"","didacticExplanation":"","didacticExample":"","policeApplication":"","modelAnswer":""}
Maximos: conceptual 30, application 20, terminology 20, argumentation 20, clarity 10.
Ahora si puedes generar retroalimentacion pedagogica breve para mostrar despues de esta respuesta: respuesta correcta orientativa, explicacion sencilla, ejemplo didactico generado y aplicacion policial. No presentes el ejemplo como cita del compendio.

Pregunta:
${input.question.question}

Conceptos esperados respaldados:
${input.question.expected_concepts.join(", ") || "Derivarlos del contexto"}

Respuesta estudiante:
${input.studentAnswer}

Contexto recuperado:
${sourceBlock(input.retrievedContext)}
`.trim(),
      maxOutputTokens: 620,
    });
    return normalizeEvaluation(
      parseJsonObject<Partial<AnswerEvaluation>>(completion.text),
      heuristic,
    );
  } catch {
    return heuristic;
  }
}

export async function generateFollowUpQuestion(input: {
  previousQuestion: SimulationQuestion;
  studentAnswer: string;
  evaluation: AnswerEvaluation;
  retrievedContext: RetrievedSource[];
  difficulty: SimulationDifficulty;
}): Promise<ExamQuestion> {
  const fallback = fallbackFollowUp(input);
  try {
    const completion = await generateTutorText({
      system: EXAMINER_SYSTEM_PROMPT,
      user: `
Genera UNA repregunta breve y coherente. Debe surgir de una omision, imprecision, concepto mencionado u oportunidad de profundizacion.
Devuelve JSON estricto con: question, questionType, difficulty, expectedConcepts. questionType debe ser follow_up.
No des la respuesta ni retroalimentacion.

Pregunta previa:
${input.previousQuestion.question}

Respuesta estudiante:
${input.studentAnswer}

Omisiones o motivo:
${[...input.evaluation.missingConcepts, input.evaluation.followUpReason].filter(Boolean).join("; ")}

Contexto recuperado:
${sourceBlock(input.retrievedContext)}
`.trim(),
      maxOutputTokens: 300,
    });
    return normalizeExamQuestion(
      parseJsonObject<Partial<ExamQuestion>>(completion.text),
      fallback,
      input.retrievedContext,
      input.difficulty,
      "follow_up",
    );
  } catch {
    return fallback;
  }
}

function shouldAskFollowUp(
  question: SimulationQuestion,
  evaluation: AnswerEvaluation,
  questions: SimulationQuestion[],
) {
  if (question.question_type === "follow_up") return false;
  const followUps = questions.filter(
    (item) => item.parent_question_id === question.id,
  ).length;
  if (followUps > 0) return false;
  return evaluation.needsFollowUp || evaluation.score.total < 76;
}

function fallbackQuestion(input: {
  difficulty: SimulationDifficulty;
  previousQuestions: string[];
  retrievedContext: RetrievedSource[];
}): ExamQuestion {
  const used = input.previousQuestions.join(" ").toLowerCase();
  const refs = sourcesToMetadata(input.retrievedContext);
  const options: ExamQuestion[] = [
    {
      question: "Explique un concepto central de la unidad estudiada.",
      questionType: "definition",
      difficulty: input.difficulty,
      expectedConcepts: [
        "concepto central",
        "elementos principales",
        "aplicación policial",
      ],
      sourceReferences: refs,
    },
    {
      question:
        "Mencione elementos principales del tema y explique brevemente uno de ellos.",
      questionType: "enumeration",
      difficulty: input.difficulty,
      expectedConcepts: [
        "elementos principales",
        "explicación",
        "función policial",
      ],
      sourceReferences: refs,
    },
    {
      question:
        "Explique la relación entre dos conceptos importantes de la unidad.",
      questionType: "comparison",
      difficulty: input.difficulty,
      expectedConcepts: ["relación conceptual", "función policial"],
      sourceReferences: refs,
    },
    {
      question:
        "En una situación hipotética de servicio, ¿cómo aplicaría este contenido para orientar una actuación correcta?",
      questionType: "application",
      difficulty: input.difficulty,
      expectedConcepts: [
        "aplicación policial",
        "contenido de la unidad",
        "conducta",
        "servicio",
      ],
      sourceReferences: refs,
    },
  ];
  return (
    options.find((item) => !used.includes(item.question.toLowerCase())) ||
    options[0]
  );
}

function fallbackFollowUp(input: {
  previousQuestion: SimulationQuestion;
  evaluation: AnswerEvaluation;
  retrievedContext: RetrievedSource[];
  difficulty: SimulationDifficulty;
}): ExamQuestion {
  const concept =
    input.evaluation.missingConcepts[0] ||
    input.previousQuestion.expected_concepts[0] ||
    "ese concepto";
  return {
    question: `Usted mencionó parcialmente el tema. ¿Puede precisar cómo se relaciona ${concept} con la función policial?`,
    questionType: "follow_up",
    difficulty: input.difficulty,
    expectedConcepts: uniqueStrings([
      concept,
      ...input.previousQuestion.expected_concepts,
    ]),
    sourceReferences: sourcesToMetadata(input.retrievedContext),
  };
}

function heuristicEvaluateAnswer(
  question: string,
  answer: string,
  expectedConcepts: string[],
): AnswerEvaluation {
  const normalized = removeAccents(answer.toLowerCase());
  const words = normalized.split(/\s+/).filter(Boolean);
  const expected = expectedConcepts.length
    ? expectedConcepts
    : questionConcepts(question);
  const hits = expected.filter((concept) =>
    concept
      .split(/\s+/)
      .some((part) => normalized.includes(removeAccents(part.toLowerCase()))),
  );
  const ratio = expected.length ? hits.length / expected.length : 0.45;
  const veryShort = words.length < 8 || /no se|no sé|nose/.test(normalized);
  const score = makeScore({
    conceptual: veryShort ? 4 : Math.round(12 + ratio * 18),
    application: veryShort
      ? 2
      : Math.min(
          20,
          Math.round((normalized.includes("policial") ? 8 : 5) + ratio * 10),
        ),
    terminology: veryShort ? 2 : Math.round(7 + ratio * 13),
    argumentation: veryShort
      ? 2
      : Math.min(20, Math.round(Math.min(words.length, 60) / 4)),
    clarity: veryShort
      ? 2
      : Math.min(10, Math.round(Math.min(words.length, 50) / 5)),
  });
  const missing = expected.filter((concept) => !hits.includes(concept));
  return {
    score,
    strengths: hits.length
      ? [`Identificó ${hits.slice(0, 2).join(" y ")}.`]
      : [],
    missingConcepts: missing,
    misconceptions: veryShort
      ? ["Respuesta insuficiente para valorar dominio conceptual."]
      : [],
    improvements: missing.length
      ? [`Debe incorporar ${missing.slice(0, 3).join(", ")}.`]
      : ["Puede profundizar con aplicación a la función policial."],
    needsFollowUp: score.total < 78 || missing.length > 0,
    followUpReason: missing[0]
      ? `Falta profundizar ${missing[0]}.`
      : "Conviene profundizar la aplicación policial.",
    feedback:
      "Retroalimentación: revisa el concepto base, los elementos omitidos y cómo aplicar la idea a la función policial.",
    correctAnswer:
      "Respuesta correcta orientativa: define el concepto con apoyo del compendio, menciona sus elementos relevantes y relaciónalo con la actuación institucional.",
    didacticExplanation:
      "En palabras sencillas, muestra qué significa el concepto y para qué sirve dentro de la institución policial.",
    didacticExample:
      "Ejemplo didáctico generado: ante una pregunta del tribunal, define el concepto, menciona sus elementos y vincúlalo con una actuación policial concreta.",
    policeApplication:
      "Aplicación policial: el concepto debe orientar la conducta, la disciplina, la jerarquía o el servicio según corresponda.",
    modelAnswer:
      "Ejemplo de una respuesta oral bien estructurada: iniciar con el concepto base, mencionar la terminología institucional relevante y cerrar explicando su aplicación en la función policial.",
  };
}
function normalizeEvaluation(
  parsed: Partial<AnswerEvaluation>,
  fallback: AnswerEvaluation,
): AnswerEvaluation {
  const score = makeScore({
    conceptual: parsed.score?.conceptual ?? fallback.score.conceptual,
    application: parsed.score?.application ?? fallback.score.application,
    terminology: parsed.score?.terminology ?? fallback.score.terminology,
    argumentation: parsed.score?.argumentation ?? fallback.score.argumentation,
    clarity: parsed.score?.clarity ?? fallback.score.clarity,
  });
  return {
    score,
    strengths: normalizeList(parsed.strengths).length
      ? normalizeList(parsed.strengths)
      : fallback.strengths,
    missingConcepts: normalizeList(parsed.missingConcepts).length
      ? normalizeList(parsed.missingConcepts)
      : fallback.missingConcepts,
    misconceptions: normalizeList(parsed.misconceptions),
    improvements: normalizeList(parsed.improvements).length
      ? normalizeList(parsed.improvements)
      : fallback.improvements,
    needsFollowUp:
      typeof parsed.needsFollowUp === "boolean"
        ? parsed.needsFollowUp
        : fallback.needsFollowUp,
    followUpReason:
      typeof parsed.followUpReason === "string" && parsed.followUpReason.trim()
        ? parsed.followUpReason.trim()
        : fallback.followUpReason,
    feedback:
      typeof parsed.feedback === "string" && parsed.feedback.trim()
        ? parsed.feedback.trim()
        : fallback.feedback,
    correctAnswer:
      typeof parsed.correctAnswer === "string" && parsed.correctAnswer.trim()
        ? parsed.correctAnswer.trim()
        : fallback.correctAnswer,
    didacticExplanation:
      typeof parsed.didacticExplanation === "string" &&
      parsed.didacticExplanation.trim()
        ? parsed.didacticExplanation.trim()
        : fallback.didacticExplanation,
    didacticExample:
      typeof parsed.didacticExample === "string" &&
      parsed.didacticExample.trim()
        ? parsed.didacticExample.trim()
        : fallback.didacticExample,
    policeApplication:
      typeof parsed.policeApplication === "string" &&
      parsed.policeApplication.trim()
        ? parsed.policeApplication.trim()
        : fallback.policeApplication,
    modelAnswer:
      typeof parsed.modelAnswer === "string" && parsed.modelAnswer.trim()
        ? parsed.modelAnswer.trim()
        : fallback.modelAnswer,
  };
}

function normalizeExamQuestion(
  parsed: Partial<ExamQuestion>,
  fallback: ExamQuestion,
  sources: RetrievedSource[],
  difficulty: SimulationDifficulty,
  forcedType?: QuestionType,
): ExamQuestion {
  return {
    question:
      typeof parsed.question === "string" && parsed.question.trim().length > 10
        ? cleanQuestion(parsed.question)
        : fallback.question,
    questionType:
      forcedType ||
      normalizeQuestionType(parsed.questionType) ||
      fallback.questionType,
    difficulty,
    expectedConcepts: normalizeList(parsed.expectedConcepts).length
      ? normalizeList(parsed.expectedConcepts)
      : fallback.expectedConcepts,
    sourceReferences: sourcesToMetadata(sources),
  };
}

function normalizeQuestionRow(row: unknown): SimulationQuestion {
  const item = row as Record<string, unknown>;
  return {
    id: String(item.id),
    position: Number(item.position),
    question: String(item.question || ""),
    question_type: normalizeQuestionType(item.question_type),
    answer: typeof item.answer === "string" ? item.answer : null,
    transcription:
      typeof item.transcription === "string" ? item.transcription : null,
    parent_question_id:
      typeof item.parent_question_id === "string"
        ? item.parent_question_id
        : null,
    score: typeof item.score === "number" ? item.score : null,
    feedback: normalizeFeedbackValue(item.feedback),
    expected_concepts: normalizeList(item.expected_concepts),
    missing_concepts: normalizeList(item.missing_concepts),
    source_references: Array.isArray(item.source_references)
      ? (item.source_references as SourceMetadata[])
      : [],
    model_answer:
      typeof item.model_answer === "string" ? item.model_answer : null,
  };
}

function normalizeResultRow(row: unknown): SimulationResult {
  const item = row as Record<string, unknown>;
  return {
    conceptual: clamp(item.conceptual, 0, 30),
    terminology: clamp(item.terminology, 0, 20),
    application: clamp(item.application, 0, 20),
    argumentation: clamp(item.argumentation, 0, 20),
    clarity: clamp(item.clarity, 0, 10),
    total: clamp(item.total, 0, 100),
    strengths: normalizeList(item.strengths),
    improvements: normalizeList(item.improvements),
    suggested_answer:
      typeof item.suggested_answer === "string" ? item.suggested_answer : "",
    review_topics: normalizeList(item.review_topics),
    concepts_omitted: normalizeList(item.concepts_omitted),
    model_answers: Array.isArray(item.model_answers)
      ? (item.model_answers as Array<{ question: string; answer: string }>)
      : [],
    error_reviews: Array.isArray(item.error_reviews)
      ? (item.error_reviews as ErrorReview[])
      : [],
    cost_estimated:
      item.cost_estimated === null || item.cost_estimated === undefined
        ? null
        : Number(item.cost_estimated),
    disclaimer:
      typeof item.disclaimer === "string" ? item.disclaimer : disclaimer,
  };
}

function normalizeFeedbackValue(value: unknown): AnswerEvaluation | null {
  if (!value || typeof value !== "object") return null;
  return normalizeEvaluation(value as Partial<AnswerEvaluation>, {
    score: makeScore({
      conceptual: 0,
      application: 0,
      terminology: 0,
      argumentation: 0,
      clarity: 0,
    }),
    strengths: [],
    missingConcepts: [],
    misconceptions: [],
    improvements: [],
    needsFollowUp: false,
    followUpReason: "",
    feedback: "",
    correctAnswer: "",
    didacticExplanation: "",
    didacticExample: "",
    policeApplication: "",
    modelAnswer: "",
  });
}

function makeScore(input: {
  conceptual: unknown;
  application: unknown;
  terminology: unknown;
  argumentation: unknown;
  clarity: unknown;
}): RubricScore {
  const conceptual = clamp(input.conceptual, 0, 30);
  const application = clamp(input.application, 0, 20);
  const terminology = clamp(input.terminology, 0, 20);
  const argumentation = clamp(input.argumentation, 0, 20);
  const clarity = clamp(input.clarity, 0, 10);
  return {
    conceptual,
    application,
    terminology,
    argumentation,
    clarity,
    total: conceptual + application + terminology + argumentation + clarity,
  };
}

function aggregateScores(questions: SimulationQuestion[]) {
  const scores = questions
    .map((question) => question.feedback?.score)
    .filter(Boolean) as RubricScore[];
  if (!scores.length) {
    return makeScore({
      conceptual: 0,
      application: 0,
      terminology: 0,
      argumentation: 0,
      clarity: 0,
    });
  }
  const average = (field: keyof Omit<RubricScore, "total">) =>
    Math.round(
      scores.reduce((sum, score) => sum + score[field], 0) / scores.length,
    );
  return makeScore({
    conceptual: average("conceptual"),
    application: average("application"),
    terminology: average("terminology"),
    argumentation: average("argumentation"),
    clarity: average("clarity"),
  });
}

function buildErrorReviews(questions: SimulationQuestion[]): ErrorReview[] {
  return questions
    .filter((question) => (question.score || 0) < 80 && question.answer)
    .slice(0, 5)
    .map((question) => ({
      question: question.question,
      studentAnswer: question.answer || "",
      whatWasGood: question.feedback?.strengths?.length
        ? question.feedback.strengths
        : ["Respondió la pregunta y permitió continuar el análisis."],
      whatWasMissing: question.missing_concepts.length
        ? question.missing_concepts
        : question.feedback?.improvements || [
            "Faltó mayor precisión conceptual.",
          ],
      conceptToCorrect: question.missing_concepts[0] || "Precisión conceptual",
      betterExplanation:
        question.model_answer ||
        "Puede mejorar iniciando con el concepto, desarrollando sus elementos y cerrando con una aplicación policial concreta.",
      didacticExample:
        "Ejemplo didáctico generado: ante una pregunta del tribunal, primero defina el concepto, luego relacione sus elementos con la actuación policial y cierre con una aplicación concreta.",
    }));
}

async function insertQuestion(input: {
  simulationId: string;
  position: number;
  examQuestion: ExamQuestion;
  parentQuestionId?: string;
}) {
  await createSupabaseAdmin()
    .from("simulation_questions")
    .insert({
      simulation_id: input.simulationId,
      position: input.position,
      question: input.examQuestion.question,
      question_type: input.examQuestion.questionType,
      parent_question_id: input.parentQuestionId || null,
      expected_concepts: input.examQuestion.expectedConcepts,
      retrieved_sources: input.examQuestion.sourceReferences,
      source_references: input.examQuestion.sourceReferences,
    });
}

function sourceBlock(sources: RetrievedSource[]) {
  return sources
    .map(
      (source, index) =>
        `[Fuente ${index + 1}: ${source.title}, Unidad ${source.unitName}${
          source.section ? `, seccion ${source.section}` : ""
        }${source.sectionName ? `, ${source.sectionName}` : ""}]\n${source.content}`,
    )
    .join("\n\n");
}

function sourcesToMetadata(sources: RetrievedSource[]): SourceMetadata[] {
  return sources.map((source, index) => ({
    index: index + 1,
    chunk_id: source.chunkId,
    document_id: source.documentId,
    title: source.title,
    source: source.source,
    version: source.version,
    section: source.section,
    section_name: source.sectionName,
    page: source.page,
    score: source.score,
  }));
}

function assertSufficientContext(sources: RetrievedSource[]) {
  if (!sources.length || sources.every((source) => source.score <= 0)) {
    throw new Error("No hay contexto RAG suficiente para el simulacro.");
  }
}

function parseJsonObject<T>(text: string): T {
  const jsonText = text.match(/\{[\s\S]*\}/)?.[0] || text;
  return JSON.parse(jsonText) as T;
}

function cleanQuestion(text: string) {
  return text
    .replace(/^["'¿\s]+|["'\s]+$/g, "")
    .replace(/^pregunta\s*:\s*/i, "")
    .trim();
}

function normalizeQuestionType(value: unknown): QuestionType {
  const type = String(value || "").toLowerCase();
  if (["definition", "definicion", "conceptual"].includes(type))
    return "definition";
  if (["explanation", "explicacion", "comprehension"].includes(type))
    return "explanation";
  if (["enumeration", "enumeracion"].includes(type)) return "enumeration";
  if (["comparison", "comparacion"].includes(type)) return "comparison";
  if (["application", "aplicacion"].includes(type)) return "application";
  if (["follow_up", "repregunta"].includes(type)) return "follow_up";
  return "explanation";
}

function normalizeList(value: unknown) {
  return Array.isArray(value)
    ? uniqueStrings(
        value
          .filter(
            (item): item is string =>
              typeof item === "string" && item.trim().length > 0,
          )
          .map((item) => item.trim()),
      ).slice(0, 8)
    : [];
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function clamp(value: unknown, min: number, max: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function removeAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function questionConcepts(question: string) {
  const text = removeAccents(question.toLowerCase());
  return [
    "doctrina policial",
    "principios institucionales",
    "disciplina",
    "jerarquía",
    "autoridad",
    "mando",
    "función policial",
    "valores",
  ].filter((concept) => text.includes(removeAccents(concept.toLowerCase())));
}

function countAnsweredMainQuestions(questions: SimulationQuestion[]) {
  return questions.filter(
    (question) => question.question_type !== "follow_up" && question.answer,
  ).length;
}

function collectMissingConcepts(questions: SimulationQuestion[]) {
  return uniqueStrings(
    questions.flatMap((question) => question.missing_concepts || []),
  );
}

function nextQuestionQuery(state: SimulationState) {
  const missing = collectMissingConcepts(state.questions).join(" ");
  const previous = state.questions
    .map((question) => question.question)
    .join(" ");
  return `${starterQuery(state.unit_number)} ${missing} ${previous}`;
}

function summarizePerformance(questions: SimulationQuestion[]) {
  const answered = questions.filter((question) => question.answer);
  const average = answered.length
    ? Math.round(
        answered.reduce((sum, question) => sum + (question.score || 0), 0) /
          answered.length,
      )
    : 0;
  const missing =
    collectMissingConcepts(answered).join(", ") || "sin omisiones registradas";
  return `Promedio parcial ${average}/100. Omisiones: ${missing}.`;
}

function adaptDifficulty(
  difficulty: SimulationDifficulty,
  questions: SimulationQuestion[],
): SimulationDifficulty {
  const answered = questions.filter((question) => question.answer);
  if (!answered.length || difficulty !== "intermedio") return difficulty;
  const average =
    answered.reduce((sum, question) => sum + (question.score || 0), 0) /
    answered.length;
  if (average >= 88) return "avanzado";
  if (average < 55) return "basico";
  return difficulty;
}

async function simulationCost(simulationId: string) {
  const { data } = await createSupabaseAdmin()
    .from("usage_events")
    .select("estimated_cost")
    .eq("simulation_id", simulationId);
  const values = (data || [])
    .map((item) => Number(item.estimated_cost))
    .filter((value) => Number.isFinite(value));
  return values.length
    ? Number(values.reduce((sum, value) => sum + value, 0).toFixed(8))
    : null;
}

async function recordChatUsage(input: {
  profileId: string;
  sessionId: string | null;
  simulationId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  requestId: string | null;
}) {
  await createSupabaseAdmin()
    .from("usage_events")
    .insert({
      user_id: input.profileId,
      session_id: input.sessionId,
      simulation_id: input.simulationId,
      provider: "openai",
      model: input.model,
      event_type: "chat",
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      estimated_cost: estimateTextCost(input.inputTokens, input.outputTokens),
      provider_request_id: input.requestId,
    });
}

export const oralExamTestUtils = {
  heuristicEvaluateAnswer,
  makeScore,
  aggregateScores,
  buildErrorReviews,
};
