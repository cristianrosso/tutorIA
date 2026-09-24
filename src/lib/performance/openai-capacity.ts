import "server-only";
import { consumeLimit } from "@/lib/auth/rate-limit";

export type OpenAIOperationKind = "text" | "stt" | "tts" | "embedding";

function limitFor(kind: OpenAIOperationKind, model: string) {
  const normalized = model.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const specific = Number(process.env[`OPENAI_${normalized}_RPM_LIMIT`]);
  if (Number.isFinite(specific) && specific > 0) return specific;
  if (kind === "stt") return Number(process.env.OPENAI_STT_RPM_LIMIT || 450);
  if (kind === "tts") return Number(process.env.OPENAI_TTS_RPM_LIMIT || 450);
  if (kind === "embedding") return Number(process.env.OPENAI_EMBEDDING_RPM_LIMIT || 2500);
  return Number(process.env.OPENAI_TEXT_RPM_LIMIT || 450);
}

export async function assertOpenAICapacity(input: {
  kind: OpenAIOperationKind;
  model: string;
}) {
  const rpm = limitFor(input.kind, input.model);
  const allowed = await consumeLimit(`openai:${input.kind}:${input.model}:rpm`, rpm, 60);
  if (!allowed) {
    const error = new Error(
      "El Tutor está atendiendo un número elevado de consultas. Intenta nuevamente en unos momentos.",
    );
    error.name = "OpenAICapacityError";
    throw error;
  }
}

export function openAITimeoutMs(kind: OpenAIOperationKind) {
  if (kind === "stt") return Number(process.env.OPENAI_STT_TIMEOUT_MS || 30000);
  if (kind === "tts") return Number(process.env.OPENAI_TTS_TIMEOUT_MS || 30000);
  if (kind === "embedding") return Number(process.env.OPENAI_EMBEDDING_TIMEOUT_MS || 30000);
  return Number(process.env.OPENAI_TEXT_TIMEOUT_MS || 45000);
}
