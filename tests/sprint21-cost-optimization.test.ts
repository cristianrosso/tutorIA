import { describe, expect, it } from "vitest";
import {
  estimateAudioInputCost,
  estimateAudioOutputCost,
  estimateModelCost,
  resolveModelPricing,
} from "@/lib/ai/costs";
import { calculateOperationCost } from "@/lib/billing/ai-usage";

describe("Sprint 21 cost optimization", () => {
  it("calcula texto con tarifa especifica del modelo", () => {
    const cost = calculateOperationCost({
      model: "gpt-5.6-luna",
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(cost).toBeGreaterThan(0);
  });

  it("aplica descuento configurable para tokens cacheados", () => {
    const full = estimateModelCost({
      model: "gpt-5.6-luna",
      inputTokens: 2000,
      outputTokens: 0,
    });
    const cached = estimateModelCost({
      model: "gpt-5.6-luna",
      inputTokens: 2000,
      cachedInputTokens: 1000,
      outputTokens: 0,
    });
    expect(cached).toBeLessThanOrEqual(full);
  });

  it("separa costos de voz de entrada y salida", () => {
    expect(estimateAudioInputCost(60, "gpt-4o-mini-transcribe")).toBeGreaterThan(0);
    expect(
      estimateAudioOutputCost({
        model: "gpt-4o-mini-tts",
        seconds: 60,
        text: "Explicación breve para el estudiante.",
      }),
    ).toBeGreaterThan(0);
  });

  it("incluye tarifa versionada para embeddings", () => {
    const pricing = resolveModelPricing("text-embedding-3-small");
    expect(pricing.pricingVersion).toBeTruthy();
    expect(
      estimateModelCost({
        model: "text-embedding-3-small",
        embeddingTokens: 1000,
      }),
    ).toBeGreaterThan(0);
  });
});
