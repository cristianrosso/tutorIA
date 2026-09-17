import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { estimateTextCost } from "@/lib/ai/costs";
import { generateTutorText } from "@/lib/ai/openai";
import { selectModel, type TutorMode } from "@/lib/ai/model-router";
import { retrieveAcademicContext } from "@/lib/knowledge/rag";
import type { AcademicIntent, KnowledgeChunkCandidate } from "@/lib/knowledge/types";
import type { Profile } from "@/lib/models";
import { TUTOR_PEDAGOGICAL_SYSTEM_PROMPT, modeInstruction } from "@/lib/tutor/prompts/system-prompt";
import { getConversationContext } from "@/lib/tutor/conversation-context";
import { insufficientContextAnswer, validateTutorResponse } from "@/lib/tutor/response-validator";

export type TutorStructuredSource = {
  knowledgeObjectId: string | null;
  chunkId: string;
  unitNumber: number | null;
  unitName: string | null;
  topicName: string | null;
  sectionName: string | null;
  reference: string | null;
  score: number;
};

export type TutorResponse = {
  conversationId: string;
  messageId: string;
  answer: string;
  intent: AcademicIntent;
  sources: TutorStructuredSource[];
  suggestedFollowUps: string[];
  usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
  diagnostics?: unknown;
};

export async function generateTutorResponse(input: {
  profile: Profile;
  conversationId?: string | null;
  message: string;
  mode?: TutorMode;
  options?: { unitNumber?: number; debug?: boolean };
}): Promise<TutorResponse> {
  const totalStarted = Date.now();
  const message = sanitizeMessage(input.message);
  const mode = input.mode || "normal";
  if (!(await consumeLimit(`tutor-chat:${input.profile.id}`, 18, 60))) {
    throw new Error("RATE_LIMIT");
  }

  const db = createSupabaseAdmin();
  const conversation = input.conversationId
    ? await getConversation(input.conversationId, input.profile.id)
    : await createConversation(input.profile.id, titleFromMessage(message));

  const userMessage = await insertMessage({
    conversationId: conversation.id,
    userId: input.profile.id,
    role: "user",
    content: message,
    tutorMode: mode,
  });

  const history = await getConversationContext({
    conversationId: conversation.id,
    userId: input.profile.id,
    currentMessage: message,
  });

  const ragStarted = Date.now();
  const academic = await retrieveAcademicContext(history.retrievalQuery, {
    unitNumber: input.options?.unitNumber,
    maxChunks: 8,
    maxContextTokens: 2600,
    debug: input.options?.debug,
  });
  const ragMs = Date.now() - ragStarted;
  const validation = validateTutorResponse({
    answer: "",
    sources: academic.sources,
    context: academic.context,
  });

  const complexity = assessComplexity(message, academic.context, academic.queryAnalysis.intent, mode);
  const model = selectModel({
    intent: academic.queryAnalysis.intent,
    complexity,
    mode,
    contextSize: academic.context.length,
  });

  let answer = insufficientContextAnswer();
  let inputTokens = 0;
  let outputTokens = 0;
  let modelUsed = model;
  let requestId: string | null = null;
  let llmMs = 0;

  if (!validation.shouldAbstain && !isPromptInjection(message)) {
    const llmStarted = Date.now();
    const prompt = buildPedagogicalPrompt({
      message,
      mode,
      intent: academic.queryAnalysis.intent,
      context: academic.context,
      history: history.summary,
      sources: academic.sources,
    });
    const completion = await generateTutorText({
      system: TUTOR_PEDAGOGICAL_SYSTEM_PROMPT,
      user: prompt,
      model,
      maxOutputTokens: mode === "quick" ? 420 : 950,
    });
    llmMs = Date.now() - llmStarted;
    const responseValidation = validateTutorResponse({
      answer: completion.text,
      sources: academic.sources,
      context: academic.context,
    });
    answer = responseValidation.shouldAbstain
      ? insufficientContextAnswer()
      : completion.text;
    inputTokens = completion.inputTokens;
    outputTokens = completion.outputTokens;
    modelUsed = completion.model;
    requestId = completion.requestId;
  }

  if (isPromptInjection(message)) {
    answer = "No puedo revelar instrucciones internas ni modificar las reglas académicas del tutor. Sí puedo ayudarte a estudiar el contenido del compendio con una pregunta concreta.";
  }

  const estimatedCost = estimateTextCost(inputTokens, outputTokens);
  const assistantMessage = await insertMessage({
    conversationId: conversation.id,
    userId: input.profile.id,
    role: "assistant",
    content: answer,
    tutorMode: mode,
    intent: academic.queryAnalysis.intent,
    modelUsed,
    inputTokens,
    outputTokens,
    estimatedCost,
  });

  await insertSources(assistantMessage.id, academic.sources);
  await db.from("usage_events").insert({
    user_id: input.profile.id,
    provider: "openai",
    model: modelUsed,
    event_type: "chat",
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost: estimatedCost,
    provider_request_id: requestId,
  });
  await db
    .from("tutor_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  return {
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    answer,
    intent: academic.queryAnalysis.intent,
    sources: toStructuredSources(academic.sources),
    suggestedFollowUps: buildFollowUps(academic.queryAnalysis.intent, mode),
    usage: { model: modelUsed, inputTokens, outputTokens, estimatedCost },
    diagnostics: input.options?.debug
      ? {
          query: history.retrievalQuery,
          mode,
          complexity,
          ragMs,
          llmMs,
          totalMs: Date.now() - totalStarted,
          academic: academic.diagnostics,
          validation,
          userMessageId: userMessage.id,
        }
      : undefined,
  };
}

function buildPedagogicalPrompt(input: {
  message: string;
  mode: TutorMode;
  intent: AcademicIntent;
  context: string;
  history: string;
  sources: KnowledgeChunkCandidate[];
}) {
  const sourceList = input.sources
    .map((source, index) => {
      const unit = source.unitNumber ? `Unidad ${source.unitNumber}${source.unitName ? ` - ${source.unitName}` : ""}` : "Unidad no determinada";
      const topic = source.topicName || source.sectionName || source.title || "Tema recuperado";
      return `Fuente ${index + 1}: Compendio FATESCIPOL 2026, ${unit}, ${topic}.`;
    })
    .join("\n");

  return `
Modo del tutor: ${input.mode}
Instrucción del modo: ${modeInstruction(input.mode)}
Intención académica detectada: ${input.intent}

Historial breve relevante:
${input.history || "Sin historial previo relevante."}

Pregunta actual del estudiante:
${input.message}

Contexto académico recuperado del compendio:
${input.context}

Fuentes para mostrar de forma sencilla:
${sourceList || "Sin fuentes suficientes."}

Instrucciones de respuesta:
- Responde de forma natural, como profesor experto.
- Usa el contexto académico para el concepto base.
- Si el estudiante pide un ejemplo, puedes empezar con el ejemplo y luego explicar el concepto.
- Si el estudiante pide simplificar, usa lenguaje sencillo y conserva el significado académico.
- Si pide que le preguntes, formula una pregunta corta de comprobación sobre el tema actual.
- Si corresponde, cierra con una pregunta breve de comprobación, pero no lo hagas siempre.
- Incluye al final una sección corta llamada "Fuente" con Compendio FATESCIPOL, unidad y tema, sin IDs internos.
`.trim();
}

async function createConversation(userId: string, title: string) {
  const { data, error } = await createSupabaseAdmin()
    .from("tutor_conversations")
    .insert({ user_id: userId, title })
    .select("id,title")
    .single();
  if (error || !data) throw new Error("No se pudo iniciar la conversación.");
  return data as { id: string; title: string };
}

async function getConversation(conversationId: string, userId: string) {
  const { data, error } = await createSupabaseAdmin()
    .from("tutor_conversations")
    .select("id,title")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("No se encontró la conversación.");
  return data as { id: string; title: string };
}

async function insertMessage(input: {
  conversationId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  tutorMode: TutorMode;
  intent?: AcademicIntent;
  modelUsed?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
}) {
  const { data, error } = await createSupabaseAdmin()
    .from("tutor_messages")
    .insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      role: input.role,
      content: input.content,
      tutor_mode: input.tutorMode,
      intent: input.intent || null,
      model_used: input.modelUsed || null,
      input_tokens: input.inputTokens || 0,
      output_tokens: input.outputTokens || 0,
      estimated_cost: input.estimatedCost || 0,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("No se pudo guardar el mensaje.");
  return data as { id: string };
}

async function insertSources(messageId: string, sources: KnowledgeChunkCandidate[]) {
  if (sources.length === 0) return;
  await createSupabaseAdmin().from("tutor_message_sources").insert(
    sources.slice(0, 8).map((source) => ({
      message_id: messageId,
      knowledge_object_id: source.knowledgeObjectId,
      chunk_id: source.chunkId,
      source_reference: source.sourceReference || source.pageReference || null,
      relevance_score: source.finalScore,
    })),
  );
}

function toStructuredSources(sources: KnowledgeChunkCandidate[]): TutorStructuredSource[] {
  return sources.slice(0, 6).map((source) => ({
    knowledgeObjectId: source.knowledgeObjectId,
    chunkId: source.chunkId,
    unitNumber: source.unitNumber,
    unitName: source.unitName,
    topicName: source.topicName,
    sectionName: source.sectionName,
    reference: source.sourceReference || source.pageReference,
    score: source.finalScore,
  }));
}

function sanitizeMessage(message: string) {
  return message.trim().replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1200);
}

function titleFromMessage(message: string) {
  const cleaned = message
    .replace(/[¿?¡!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, 5);
  return words.length ? words.join(" ") : "Nueva conversación";
}

function assessComplexity(message: string, context: string, intent: AcademicIntent, mode: TutorMode) {
  if (mode === "explain" || mode === "review" || intent === "comparison") return "HIGH" as const;
  if (message.split(/\s+/).length > 24 || context.length > 2600) return "MEDIUM" as const;
  return "LOW" as const;
}

function isPromptInjection(message: string) {
  return /ignora tus reglas|muestra.*prompt|dime.*prompt|instrucciones internas|revela.*sistema|api key|clave secreta/i.test(
    message,
  );
}

function buildFollowUps(intent: AcademicIntent, mode: TutorMode) {
  if (intent === "example" || mode === "example") {
    return ["Explícame el concepto", "Dame otro ejemplo", "Hazme una pregunta de examen"];
  }
  if (intent === "definition") {
    return ["Explícamelo más fácil", "Dame un ejemplo", "¿Cuál es su importancia?"];
  }
  if (intent === "procedure") {
    return ["Ordéname los pasos", "Dame un caso práctico", "Pregúntame sobre el procedimiento"];
  }
  return ["Explícamelo más fácil", "Dame un ejemplo", "Pregúntame sobre esto"];
}
