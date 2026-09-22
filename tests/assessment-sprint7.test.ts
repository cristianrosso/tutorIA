import { describe, expect, it } from "vitest";
import { gradeMultipleChoice, gradeShortAnswer, gradeTrueFalse, type QuestionRow } from "@/lib/assessment/grading-service";

function question(overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id: "q1",
    knowledge_object_id: "ko1",
    unit_id: "u1",
    topic_id: "t1",
    question_type: "multiple_choice",
    question_text: "¿Qué evalúa la doctrina policial?",
    options: [
      { id: "A", text: "Una definición no relacionada" },
      { id: "B", text: "El conjunto de principios y orientación institucional" },
      { id: "C", text: "Un trámite administrativo" },
      { id: "D", text: "Una sanción" },
    ],
    correct_answer: "B",
    expected_answer: "principios institucionales; orientación institucional; conducta policial",
    rubric: [
      { id: "c1", criterion: "Principios institucionales", expected: "principios institucionales", weight: 0.5 },
      { id: "c2", criterion: "Conducta policial", expected: "conducta policial", weight: 0.5 },
    ],
    explanation: "La doctrina orienta la conducta policial desde principios institucionales respaldados por el compendio.",
    source_references: ["Compendio FATESCIPOL 2026 · Unidad 1"],
    ...overrides,
  };
}

describe("Sprint 7 grading service", () => {
  it("corrige opción múltiple de forma determinista", () => {
    const feedback = gradeMultipleChoice(question(), "B");
    expect(feedback.result).toBe("correct");
    expect(feedback.score).toBe(1);
    expect(feedback.correctAnswer).toContain("B.");
  });

  it("explica una opción múltiple incorrecta sin marcarla como correcta", () => {
    const feedback = gradeMultipleChoice(question(), "A");
    expect(feedback.result).toBe("incorrect");
    expect(feedback.score).toBe(0);
    expect(feedback.missingConcepts.length).toBeGreaterThan(0);
  });

  it("corrige verdadero/falso de forma determinista", () => {
    const feedback = gradeTrueFalse(question({ question_type: "true_false", correct_answer: false }), false);
    expect(feedback.result).toBe("correct");
    expect(feedback.correctAnswer).toBe("Falso");
  });

  it("acepta formulaciones equivalentes en respuesta corta", () => {
    const feedback = gradeShortAnswer(
      question({ question_type: "short_answer" }),
      "La doctrina policial orienta la conducta policial mediante principios institucionales.",
    );
    expect(feedback.result).toBe("correct");
    expect(feedback.gradingMethod).toBe("semantic_rules");
  });

  it("detecta respuestas parciales", () => {
    const feedback = gradeShortAnswer(question({ question_type: "short_answer" }), "Menciona principios institucionales.");
    expect(feedback.result).toBe("partially_correct");
    expect(feedback.score).toBe(0.5);
  });
});
