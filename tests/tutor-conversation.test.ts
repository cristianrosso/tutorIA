import { describe, expect, it } from "vitest";
import { selectModel } from "@/lib/ai/model-router";
import { insufficientContextAnswer, validateTutorResponse } from "@/lib/tutor/response-validator";

describe("tutor conversacional Sprint 5C", () => {
  it("selecciona modelo rapido para definiciones simples", () => {
    expect(
      selectModel({
        intent: "definition",
        complexity: "LOW",
        mode: "normal",
        contextSize: 900,
      }),
    ).toContain("luna");
  });

  it("selecciona modelo fuerte para explicaciones profundas", () => {
    expect(
      selectModel({
        intent: "explanation",
        complexity: "HIGH",
        mode: "explain",
        contextSize: 3200,
      }),
    ).toContain("terra");
  });

  it("marca contexto insuficiente sin fuentes", () => {
    const validation = validateTutorResponse({
      answer: "",
      sources: [],
      context: "",
    });
    expect(validation.shouldAbstain).toBe(true);
    expect(insufficientContextAnswer()).toContain("No encontré suficiente información");
  });
});
