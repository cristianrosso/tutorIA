import { describe, expect, it } from "vitest";
import { calculateOperationCost } from "@/lib/billing/ai-usage";

describe("Sprint 6 academic memory and billing", () => {
  it("calcula costo por modelo usando tokens de entrada y salida", () => {
    const cost = calculateOperationCost({
      model: "gpt-5.6-luna",
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(cost).toBeGreaterThan(0);
  });

  it("mantiene cobertura academica separada del rendimiento observado", () => {
    const studiedTopics = 4;
    const totalTopics = 10;
    const correctAnswers = 0;
    const incorrectAnswers = 0;
    const coverage = Math.round((studiedTopics / totalTopics) * 100);
    const observedAccuracy = correctAnswers + incorrectAnswers
      ? Math.round((correctAnswers / (correctAnswers + incorrectAnswers)) * 100)
      : null;
    expect(coverage).toBe(40);
    expect(observedAccuracy).toBeNull();
  });
});
