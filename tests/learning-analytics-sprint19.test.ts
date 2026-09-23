import { describe, expect, it } from "vitest";
import { learningState, observedAccuracy, percentage, periodStart } from "@/lib/analytics/learning-analytics";

describe("Sprint 19 learning analytics rules", () => {
  it("no calcula porcentaje sin denominador", () => {
    expect(percentage(5, 0)).toBeNull();
    expect(percentage(4, 8)).toBe(50);
  });

  it("devuelve null cuando no hay rendimiento observado", () => {
    expect(observedAccuracy([])).toBeNull();
    expect(observedAccuracy([{ total_score: 8, max_score: 10 }, { total_score: 3, max_score: 6 }])).toBe(65);
  });

  it("distingue actividad, práctica, evaluación y refuerzo", () => {
    expect(learningState({ eventCount: 0, practiceAttempts: 0, assessmentCount: 0, simulationCount: 0, incorrectAnswers: 0 })).toBe("Sin evidencia suficiente");
    expect(learningState({ eventCount: 2, practiceAttempts: 0, assessmentCount: 0, simulationCount: 0, incorrectAnswers: 0 })).toBe("Estudiado");
    expect(learningState({ eventCount: 2, practiceAttempts: 1, assessmentCount: 0, simulationCount: 0, incorrectAnswers: 0 })).toBe("Practicado");
    expect(learningState({ eventCount: 2, practiceAttempts: 1, assessmentCount: 1, simulationCount: 0, incorrectAnswers: 0 })).toBe("Evaluado");
    expect(learningState({ eventCount: 2, practiceAttempts: 1, assessmentCount: 1, simulationCount: 0, incorrectAnswers: 2 })).toBe("Requiere refuerzo según resultados");
  });

  it("usa 40 días como periodo operativo configurable del sprint", () => {
    expect(periodStart("all")).toBeNull();
    expect(periodStart("40d")).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
