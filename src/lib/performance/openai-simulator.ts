import "server-only";

export type SimulatedOpenAIKind = "text" | "stt" | "tts";

function simulationEnabled() {
  return process.env.OPENAI_SIMULATION_MODE === "true";
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldFail(rate: number) {
  return rate > 0 && Math.random() < rate;
}

export function isOpenAISimulationEnabled() {
  return simulationEnabled();
}

export async function simulateOpenAIText(input: {
  prompt: string;
  model: string;
  maxOutputTokens?: number;
}) {
  const delayMs = numberEnv("OPENAI_SIMULATED_TEXT_DELAY_MS", 650);
  const errorRate = numberEnv("OPENAI_SIMULATED_ERROR_RATE", 0);
  const rateLimitRate = numberEnv("OPENAI_SIMULATED_429_RATE", 0);
  await sleep(delayMs);
  if (shouldFail(rateLimitRate)) throw new Error("OpenAI simulado respondió con estado 429: capacidad temporalmente agotada.");
  if (shouldFail(errorRate)) throw new Error("OpenAI simulado falló temporalmente.");
  const words = input.prompt.trim().split(/\s+/).filter(Boolean).length;
  const outputTokens = Math.min(input.maxOutputTokens || 420, 180);
  return {
    text:
      "Respuesta simulada para pruebas de rendimiento. Este texto no valida calidad académica ni reemplaza el RAG real.",
    model: input.model,
    requestId: `sim-text-${Date.now()}`,
    inputTokens: Math.max(1, Math.ceil(words * 1.35)),
    outputTokens,
  };
}

export async function simulateOpenAITranscription(input: { model: string }) {
  const delayMs = numberEnv("OPENAI_SIMULATED_STT_DELAY_MS", 450);
  const errorRate = numberEnv("OPENAI_SIMULATED_ERROR_RATE", 0);
  const rateLimitRate = numberEnv("OPENAI_SIMULATED_429_RATE", 0);
  await sleep(delayMs);
  if (shouldFail(rateLimitRate)) throw new Error("OpenAI STT simulado respondió con estado 429.");
  if (shouldFail(errorRate)) throw new Error("OpenAI STT simulado falló temporalmente.");
  return {
    text: "Explícame el concepto principal de la unidad para una prueba de rendimiento.",
    model: input.model,
    requestId: `sim-stt-${Date.now()}`,
    inputTokens: 120,
    outputTokens: 24,
  };
}

export async function simulateOpenAISpeech(input: { text: string; model: string }) {
  const delayMs = numberEnv("OPENAI_SIMULATED_TTS_DELAY_MS", 500);
  const errorRate = numberEnv("OPENAI_SIMULATED_ERROR_RATE", 0);
  const rateLimitRate = numberEnv("OPENAI_SIMULATED_429_RATE", 0);
  await sleep(delayMs);
  if (shouldFail(rateLimitRate)) throw new Error("OpenAI TTS simulado respondió con estado 429.");
  if (shouldFail(errorRate)) throw new Error("OpenAI TTS simulado falló temporalmente.");
  const audio = new TextEncoder().encode(`simulated-audio:${input.text.slice(0, 80)}`).buffer;
  return {
    audio,
    contentType: "audio/mpeg",
    model: input.model,
    requestId: `sim-tts-${Date.now()}`,
    inputTokens: Math.max(1, Math.ceil(input.text.split(/\s+/).filter(Boolean).length * 1.35)),
    outputTokens: 0,
  };
}
