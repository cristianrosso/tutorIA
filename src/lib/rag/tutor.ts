import "server-only";
import { TUTOR_SYSTEM_PROMPT } from "@/prompts/tutor-system";
import { generateTutorText } from "@/lib/ai/openai";
import { estimateTextCost } from "@/lib/ai/costs";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { retrieveContext, type RetrievedSource } from "@/lib/rag/retrieve";
import type { Profile } from "@/lib/models";
import { recordUnitProgress } from "@/lib/progress";

export type TutorIntent =
  | "normal"
  | "facil"
  | "ejemplo"
  | "otro_ejemplo"
  | "examen"
  | "pregunta"
  | "no_entendi";

function sourceLabel(source: RetrievedSource, index: number) {
  const section = source.section
    ? `, seccion ${source.section}${source.sectionName ? ` ${source.sectionName}` : ""}`
    : "";
  const page = source.page ? `, pagina ${source.page}` : "";
  return `[Fuente ${index + 1}: ${source.title}, ${source.source}, Unidad ${source.unitName}${section}${page}]`;
}

export function buildTutorContext(
  question: string,
  sources: RetrievedSource[],
  options?: {
    conversationContext?: string;
    intent?: TutorIntent;
    voice?: boolean;
  },
) {
  const conversationContext = options?.conversationContext
    ? `\nContexto conversacional breve:\n${options.conversationContext}\n`
    : "";
  const voiceInstructions = options?.voice
    ? [
        "- Esta respuesta sera hablada: usa frases naturales, breves y ordenadas.",
        "- Duracion obligatoria: entre 30 y 60 segundos, salvo que falte contexto academico.",
        "- Limite practico estricto: 70 a 110 palabras. No incluyas listas largas.",
        "- Para voz, conserva la logica pedagogica en forma compacta: concepto, explicacion sencilla y un ejemplo breve solo cuando corresponda.",
        "- Si el estudiante pide examen oral, entrega solo la respuesta modelo y una idea clave.",
        "- No leas las referencias completas en voz alta; las fuentes se muestran en pantalla.",
        "- Si el estudiante pide ampliar, usa el contexto conversacional para continuar sin repetir literalmente.",
      ].join("\n")
    : "";
  const intentInstructions = options?.intent
    ? intentToInstruction(options.intent)
    : "";
  return `
Pregunta del estudiante:
${question}
${conversationContext}

Contexto recuperado del compendio:
${sources
  .map((source, index) => `${sourceLabel(source, index)}\n${source.content}`)
  .join("\n\n")}

Instrucciones de respuesta:
- Responde en espanol claro, natural y con tono de profesor experto.
- Adapta el orden a la intencion: concepto primero si pide concepto; ejemplo primero si pide ejemplo; explicacion sencilla primero si no entendio; respuesta modelo primero si pide examen oral.
- Usa solo el contexto recuperado para el concepto base.
- Mantén separacion logica entre contenido del compendio, explicacion pedagogica y ejemplo didactico generado, pero no uses una plantilla rigida si rompe la naturalidad.
- Si das un ejemplo, aclara que es didactico cuando no proviene literalmente del compendio.
- Despues del ejemplo, conecta explicitamente con el concepto academico del compendio.
- No inventes normas, articulos, procedimientos, fechas, sanciones, atribuciones ni definiciones oficiales.
- Si el estudiante pide preparacion oral, incluye una respuesta breve para practicar.
${intentInstructions}
${voiceInstructions}
`.trim();
}

function noContextAnswer() {
  return [
    "No puedo responder con respaldo academico suficiente porque todavia no hay fragmentos relevantes del compendio cargados para esta pregunta.",
    "",
    "Cuando el administrador cargue el contenido oficial de Unidad 1, Doctrina Policial, podre explicarlo separando contenido del compendio, explicacion pedagogica y ejemplo didactico generado.",
  ].join("\n");
}

export async function answerQuestion(input: {
  profile: Profile;
  question: string;
  unitNumber?: number;
  section?: string;
  sessionId?: string;
  mode?: "text" | "voice";
  intent?: TutorIntent;
}) {
  const totalStarted = Date.now();
  const db = createSupabaseAdmin();
  const { data: unit, error: unitError } = await db
    .from("units")
    .select("id,number,name")
    .eq("number", input.unitNumber || 1)
    .single();
  if (unitError || !unit) throw new Error("No se encontró la unidad.");
  const session = input.sessionId
    ? await readExistingSession(input.sessionId, input.profile.id)
    : await createStudySession(
        input.profile.id,
        unit.id as string,
        input.mode || "text",
      );
  await db
    .from("messages")
    .insert({ session_id: session.id, role: "user", content: input.question });

  const history = await readRecentHistory(session.id, input.question);
  const retrievalQuestion = compactRetrievalQuestion(input.question, history);
  const retrievalStarted = Date.now();
  const sources = await retrieveContext(
    retrievalQuestion,
    unit.number as number,
    { section: input.section },
  );
  const retrievalMs = Date.now() - retrievalStarted;
  if (sources.length === 0) {
    const answer = noContextAnswer();
    await db.from("messages").insert({
      session_id: session.id,
      role: "assistant",
      content: answer,
      retrieved_sources: [],
    });
    return {
      answer,
      sources,
      sessionId: session.id as string,
      unitId: unit.id as string,
    };
  }

  const llmStarted = Date.now();
  const completion = await generateTutorText({
    system: TUTOR_SYSTEM_PROMPT,
    user: buildTutorContext(input.question, sources, {
      conversationContext: formatHistory(history),
      intent: input.intent,
      voice: input.mode === "voice",
    }),
    maxOutputTokens: input.mode === "voice" ? 190 : 900,
  });
  const llmMs = Date.now() - llmStarted;
  const sourceMetadata = sources.map((source, index) => ({
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
  await db.from("messages").insert({
    session_id: session.id,
    role: "assistant",
    content: completion.text,
    retrieved_sources: sourceMetadata,
  });
  await db.from("usage_events").insert({
    user_id: input.profile.id,
    session_id: session.id,
    unit_id: unit.id,
    feature: input.mode === "voice" ? "tutor_voice" : "tutor_text",
    provider: "openai",
    model: completion.model,
    event_type: "chat",
    input_tokens: completion.inputTokens,
    output_tokens: completion.outputTokens,
    estimated_cost: estimateTextCost(
      completion.inputTokens,
      completion.outputTokens,
    ),
    retrieval_ms: retrievalMs,
    llm_ms: llmMs,
    total_ms: Date.now() - totalStarted,
    provider_request_id: completion.requestId,
  });
  await recordUnitProgress({
    userId: input.profile.id,
    unitId: unit.id as string,
    questions: 1,
  });
  return {
    answer: completion.text,
    sources,
    sessionId: session.id as string,
    unitId: unit.id as string,
  };
}

export const answerTutorQuestion = answerQuestion;

export function detectTutorIntent(text: string): TutorIntent {
  const value = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  if (/no entendi|no entiendo|mas facil|explicamelo facil/.test(value))
    return "no_entendi";
  if (/otro ejemplo|otro caso/.test(value)) return "otro_ejemplo";
  if (/dame un ejemplo|ejemplo|caso practico/.test(value)) return "ejemplo";
  if (/examen|respondo|respuesta oral|exposicion oral/.test(value))
    return "examen";
  if (/preguntame|hazme una pregunta|comprension/.test(value))
    return "pregunta";
  if (/explicamelo|explicame|explica/.test(value)) return "facil";
  return "normal";
}

function intentToInstruction(intent: TutorIntent) {
  const instructions: Record<TutorIntent, string> = {
    normal: "",
    facil:
      "- Intencion detectada: explicar. Da una explicacion normal y clara, sin perder rigor academico.",
    ejemplo:
      "- Intencion detectada: ejemplo. Empieza con un ejemplo didactico generado, concreto y natural; despues explica el concepto del compendio que el ejemplo ilustra. No empieces con A) CONTENIDO DEL COMPENDIO.",
    otro_ejemplo:
      "- Intencion detectada: otro ejemplo. Empieza con un ejemplo distinto al anterior; despues conecta con el concepto academico sin repetir literalmente la respuesta previa.",
    examen:
      "- Intencion detectada: examen oral. Empieza con una respuesta modelo breve, ordenada y defendible; despues agrega una idea clave si ayuda.",
    pregunta:
      "- Intencion detectada: comprobacion. Formula una pregunta breve para verificar comprension.",
    no_entendi:
      "- Intencion detectada: no entendio. Empieza con lenguaje mas sencillo y una analogia prudente; despues vuelve al concepto academico sin inventar contenido oficial.",
  };
  return instructions[intent];
}

async function createStudySession(
  userId: string,
  unitId: string,
  mode: "text" | "voice",
) {
  const { data, error } = await createSupabaseAdmin()
    .from("study_sessions")
    .insert({ user_id: userId, unit_id: unitId, mode })
    .select("id")
    .single();
  if (error || !data) throw new Error("No se pudo iniciar la sesión.");
  return data as { id: string };
}

async function readExistingSession(sessionId: string, userId: string) {
  const { data, error } = await createSupabaseAdmin()
    .from("study_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("No se encontró la conversación.");
  return data as { id: string };
}

async function readRecentHistory(sessionId: string, currentQuestion: string) {
  const { data, error } = await createSupabaseAdmin()
    .from("messages")
    .select("role,content,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(7);
  if (error || !data) return [];
  return data
    .reverse()
    .filter((message) => message.content !== currentQuestion)
    .slice(-6) as Array<{ role: string; content: string }>;
}

function compactRetrievalQuestion(
  question: string,
  history: Array<{ role: string; content: string }>,
) {
  const recentUserConcept = history
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .findLast((content) => content.length > 12);
  const needsContext =
    detectTutorIntent(question) !== "normal" ||
    question.trim().split(/\s+/).length < 5;
  return needsContext && recentUserConcept
    ? `${recentUserConcept}\n${question}`
    : question;
}

function formatHistory(history: Array<{ role: string; content: string }>) {
  return history
    .slice(-4)
    .map((message) => {
      const content =
        message.content.length > 420
          ? `${message.content.slice(0, 420)}...`
          : message.content;
      return `${message.role === "assistant" ? "Tutor" : "Estudiante"}: ${content}`;
    })
    .join("\n");
}
