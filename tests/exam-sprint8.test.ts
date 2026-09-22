import { describe, expect, it } from "vitest";
import { createExamSchema, distributeCounts, normalizeExamDifficulty, normalizeExamQuestionType } from "@/lib/exams/types";

describe("Sprint 8 exam simulator helpers", () => {
  it("distribuye preguntas entre unidades sin exceder el total", () => {
    expect(distributeCounts(7, [1, 2, 3])).toEqual([
      { unitNumber: 1, count: 3 },
      { unitNumber: 2, count: 2 },
      { unitNumber: 3, count: 2 },
    ]);
  });

  it("limita unidades duplicadas y no produce bloques vacíos", () => {
    expect(distributeCounts(2, [1, 1, 2, 3])).toEqual([
      { unitNumber: 1, count: 1 },
      { unitNumber: 2, count: 1 },
    ]);
  });

  it("fuerza tribunal a pregunta abierta", () => {
    expect(normalizeExamQuestionType("mixed", "tribunal")).toBe("open_answer");
    expect(normalizeExamQuestionType("multiple_choice", "unit")).toBe("multiple_choice");
  });

  it("rota dificultad cuando el simulacro es mixto", () => {
    expect(normalizeExamDifficulty("mixed", 0)).toBe("basic");
    expect(normalizeExamDifficulty("mixed", 1)).toBe("intermediate");
    expect(normalizeExamDifficulty("mixed", 2)).toBe("advanced");
    expect(normalizeExamDifficulty("advanced", 0)).toBe("advanced");
  });

  it("valida una configuración completa de examen", () => {
    const parsed = createExamSchema.parse({
      examMode: "integral",
      unitNumbers: [1, 2, 3],
      questionType: "mixed",
      difficulty: "mixed",
      count: 10,
      durationMinutes: 60,
    });
    expect(parsed.unitNumbers).toEqual([1, 2, 3]);
    expect(parsed.count).toBe(10);
  });
});
