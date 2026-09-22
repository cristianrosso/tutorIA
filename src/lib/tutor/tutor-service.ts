import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { estimateTextCost } from "@/lib/ai/costs";
import { generateTutorText } from "@/lib/ai/openai";
import { selectModel, type TutorMode } from "@/lib/ai/model-router";
import { recordAIUsage } from "@/lib/billing/ai-usage";
import { retrieveAcademicContext } from "@/lib/knowledge/rag";
import type {
  AcademicIntent,
  KnowledgeChunkCandidate,
} from "@/lib/knowledge/types";
import {
  ensureStudentAcademicProfile,
  recordSourcesAsLearning,
} from "@/lib/learning/academic-memory";
import { buildStudentMemoryContext } from "@/lib/learning/memory-context";
import { buildAdaptiveTutorContext } from "@/lib/adaptive/recommendation-engine";
import { buildStudyPlanContext } from "@/lib/study-plan/study-plan-context";
import type { Profile } from "@/lib/models";
import { TUTOR_PEDAGOGICAL_SYSTEM_PROMPT } from "@/lib/tutor/prompts/system-prompt";
import { getConversationContext } from "@/lib/tutor/conversation-context";
import {
  insufficientContextAnswer,
  validateTutorResponse,
} from "@/lib/tutor/response-validator";
import { detectPedagogicalMode } from "@/lib/pedagogy/mode-detector";
import {
  getPedagogicalPreference,
  recordPedagogicalInteraction,
  savePedagogicalPreference,
} from "@/lib/pedagogy/preferences";
import {
  buildMultilevelPedagogicalPrompt,
  maxTokensForMode,
} from "@/lib/pedagogy/prompt-builder";
import { selectPedagogicalStrategy } from "@/lib/pedagogy/strategy-selector";
import type { PedagogicalStrategy } from "@/lib/pedagogy/types";

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
  mode: TutorMode;
  strategy: PedagogicalStrategy;
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
  options?: { unitNumber?: number; debug?: boolean; voice?: boolean };
}): Promise<TutorResponse> {
  const totalStarted = Date.now();
  const message = sanitizeMessage(input.message);
  const requestedMode = input.mode || "normal";
  if (!(await consumeLimit(`tutor-chat:${input.profile.id}`, 18, 60))) {
    throw new Error("RATE_LIMIT");
  }

  const db = createSupabaseAdmin();
  await ensureStudentAcademicProfile(input.profile.id);
  const pedagogicalPreference = await getPedagogicalPreference(
    input.profile.id,
  );
  const modeDetection = detectPedagogicalMode({
    message,
    requestedMode,
    preference: pedagogicalPreference,
  });
  const mode = modeDetection.mode;
  const conversation = input.conversationId
    ? await getConversation(input.conversationId, input.profile.id).catch(() =>
        createConversation(input.profile.id, titleFromMessage(message)),
      )
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
  const [memoryContext, adaptiveContext, studyPlanContext] = await Promise.all([
    buildStudentMemoryContext({
      userId: input.profile.id,
      currentQuery: message,
      conversationId: conversation.id,
    }),
    buildAdaptiveTutorContext({ userId: input.profile.id, limit: 3 }),
    buildStudyPlanContext(input.profile.id),
  ]);

  const ragStarted = Date.now();
  const retrievalQuery = needsAcademicMemoryForRetrieval(message)
    ? `${history.retrievalQuery}\n${memoryContext}`
    : history.retrievalQuery;
  const academic = await retrieveAcademicContext(retrievalQuery, {
    unitNumber: input.options?.unitNumber,
    maxChunks: input.options?.voice ? 5 : 8,
    maxContextTokens: input.options?.voice ? 1800 : 2600,
    debug: input.options?.debug,
  });
  const ragMs = Date.now() - ragStarted;
  const validation = validateTutorResponse({
    answer: "",
    sources: academic.sources,
    context: academic.context,
  });

  const strategy = selectPedagogicalStrategy({
    query: message,
    mode,
    queryIntent: academic.queryAnalysis.intent,
    academicMemory: memoryContext,
    availableSources: academic.sources,
    reformulationRequested: modeDetection.reformulationRequested,
  });

  const complexity = assessComplexity(
    message,
    academic.context,
    academic.queryAnalysis.intent,
    mode,
  );
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
    const prompt = buildMultilevelPedagogicalPrompt({
      query: message,
      mode,
      queryIntent: academic.queryAnalysis.intent,
      context: academic.context,
      history: history.summary,
      memoryContext,
      adaptiveContext,
      studyPlanContext,
      availableSources: academic.sources,
      academicMemory: memoryContext,
      strategy,
      reformulationRequested: modeDetection.reformulationRequested,
    });
    const completion = await generateTutorText({
      system: TUTOR_PEDAGOGICAL_SYSTEM_PROMPT,
      user: prompt,
      model,
      maxOutputTokens: input.options?.voice
        ? Math.min(520, maxTokensForMode(mode))
        : maxTokensForMode(mode),
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
    answer =
      "No puedo revelar instrucciones internas ni modificar las reglas académicas del tutor. Sí puedo ayudarte a estudiar el contenido del compendio con una pregunta concreta.";
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

  const postResponseTasks: Array<Promise<unknown>> = [
    insertSources(assistantMessage.id, academic.sources),
    recordPedagogicalInteraction({
      userId: input.profile.id,
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      mode,
      strategy,
      reformulationRequested: modeDetection.reformulationRequested,
      metadata: {
        detectionReason: modeDetection.reason,
        detectionConfidence: modeDetection.confidence,
        queryIntent: academic.queryAnalysis.intent,
      },
    }),
    Promise.resolve(
      db.from("usage_events").insert({
        user_id: input.profile.id,
        provider: "openai",
        model: modelUsed,
        event_type: "chat",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost: estimatedCost,
        provider_request_id: requestId,
      }),
    ),
    recordAIUsage({
      userId: input.profile.id,
      operationId: `tutor-chat:${assistantMessage.id}`,
      conversationId: conversation.id,
      operationType: "tutor_chat",
      model: modelUsed,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimatedCost,
      costIsEstimated: inputTokens === 0 && outputTokens === 0,
    }),
    recordSourcesAsLearning({
      userId: input.profile.id,
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      sources: academic.sources,
      intent: academic.queryAnalysis.intent,
      tutorMode: mode,
    }),
    Promise.resolve(
      db
        .from("tutor_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversation.id),
    ),
  ];
  if (modeDetection.explicitPreference && mode !== "normal") {
    postResponseTasks.push(
      savePedagogicalPreference({
        userId: input.profile.id,
        preferredMode: mode,
        reason: modeDetection.reason,
      }),
    );
  }
  const postResponseResults = await Promise.allSettled(postResponseTasks);
  for (const result of postResponseResults) {
    if (result.status === "rejected")
      console.error("tutor post-response task failed", result.reason);
  }

  return {
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    answer,
    intent: academic.queryAnalysis.intent,
    sources: toStructuredSources(academic.sources),
    suggestedFollowUps: buildFollowUps(
      academic.queryAnalysis.intent,
      mode,
      strategy,
    ),
    mode,
    strategy,
    usage: { model: modelUsed, inputTokens, outputTokens, estimatedCost },
    diagnostics: input.options?.debug
      ? {
          query: history.retrievalQuery,
          memoryContext,
          adaptiveContext,
          studyPlanContext,
          requestedMode,
          mode,
          modeDetection,
          strategy,
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

async function insertSources(
  messageId: string,
  sources: KnowledgeChunkCandidate[],
) {
  if (sources.length === 0) return;
  await createSupabaseAdmin()
    .from("tutor_message_sources")
    .insert(
      sources.slice(0, 8).map((source) => ({
        message_id: messageId,
        knowledge_object_id: source.knowledgeObjectId,
        chunk_id: source.chunkId,
        source_reference:
          source.sourceReference || source.pageReference || null,
        relevance_score: source.finalScore,
      })),
    );
}

function toStructuredSources(
  sources: KnowledgeChunkCandidate[],
): TutorStructuredSource[] {
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
  return message
    .trim()
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .slice(0, 1200);
}

function titleFromMessage(message: string) {
  const cleaned = message
    .replace(/[¿?¡!.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, 5);
  return words.length ? words.join(" ") : "Nueva conversación";
}

function assessComplexity(
  message: string,
  context: string,
  intent: AcademicIntent,
  mode: TutorMode,
) {
  if (
    [
      "explain",
      "simple",
      "academic",
      "deep",
      "review",
      "comparison",
      "step_by_step",
    ].includes(mode) ||
    intent === "comparison"
  )
    return "HIGH" as const;
  if (message.split(/\s+/).length > 24 || context.length > 2600)
    return "MEDIUM" as const;
  return "LOW" as const;
}

function isPromptInjection(message: string) {
  return /ignora tus reglas|muestra.*prompt|dime.*prompt|instrucciones internas|revela.*sistema|api key|clave secreta/i.test(
    message,
  );
}

function needsAcademicMemoryForRetrieval(message: string) {
  return /continuemos|sigamos|lo que estaba estudiando|ultimo tema|último tema|repasar lo anterior|seguir con eso/i.test(
    message,
  );
}

function buildFollowUps(
  intent: AcademicIntent,
  mode: TutorMode,
  strategy: PedagogicalStrategy,
) {
  if (strategy === "COMPARATIVE_EXPLANATION" || mode === "comparison") {
    return [
      "Hazme una tabla comparativa",
      "Dame un ejemplo comparativo",
      "Pregúntame la diferencia clave",
    ];
  }
  if (strategy === "PROCEDURAL_EXPLANATION" || mode === "step_by_step") {
    return [
      "Ordéname los pasos",
      "Dame un caso práctico",
      "Pregúntame la secuencia",
    ];
  }
  if (intent === "example" || mode === "example") {
    return [
      "Explícame el concepto",
      "Dame otro ejemplo",
      "Hazme una pregunta de examen",
    ];
  }
  if (intent === "definition") {
    return [
      "Explícamelo más fácil",
      "Dame un ejemplo",
      "¿Cuál es su importancia?",
    ];
  }
  if (intent === "procedure") {
    return [
      "Ordéname los pasos",
      "Dame un caso práctico",
      "Pregúntame sobre el procedimiento",
    ];
  }
  if (mode === "review")
    return [
      "Hazme una pregunta",
      "Dame una respuesta modelo",
      "Explícame el error común",
    ];
  return [
    "Explícamelo más fácil",
    "Dame un ejemplo",
    "Profundiza un poco más",
    "Pregúntame sobre esto",
  ];
}
