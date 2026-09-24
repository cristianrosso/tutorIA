import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  simulateOpenAISpeech,
  simulateOpenAIText,
  simulateOpenAITranscription,
} from "@/lib/performance/openai-simulator";

vi.mock("@/lib/auth/rate-limit", () => ({
  consumeLimit: vi.fn(async () => false),
}));

describe("Sprint 22 performance utilities", () => {
  const oldEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...oldEnv, OPENAI_SIMULATED_TEXT_DELAY_MS: "0", OPENAI_SIMULATED_STT_DELAY_MS: "0", OPENAI_SIMULATED_TTS_DELAY_MS: "0", OPENAI_SIMULATED_ERROR_RATE: "0", OPENAI_SIMULATED_429_RATE: "0" };
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  it("simula texto, transcripción y voz sin usar OpenAI real", async () => {
    const text = await simulateOpenAIText({ prompt: "prueba", model: "gpt-5.6-luna" });
    const stt = await simulateOpenAITranscription({ model: "gpt-4o-mini-transcribe" });
    const tts = await simulateOpenAISpeech({ text: "respuesta", model: "gpt-4o-mini-tts" });

    expect(text.requestId).toContain("sim-text");
    expect(stt.text).toContain("Explícame");
    expect(tts.contentType).toBe("audio/mpeg");
  });

  it("devuelve un error operativo cuando no hay capacidad OpenAI", async () => {
    const { assertOpenAICapacity } = await import("@/lib/performance/openai-capacity");
    await expect(assertOpenAICapacity({ kind: "text", model: "gpt-5.6-luna" })).rejects.toThrow(
      "número elevado de consultas",
    );
  });
});
