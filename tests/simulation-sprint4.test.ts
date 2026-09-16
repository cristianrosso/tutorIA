import { describe, expect, it } from "vitest";
import { selectVisibleSimulation } from "@/components/simulation-panel";
import { oralExamTestUtils } from "@/lib/simulations/oral-exam";
import type { SimulationState } from "@/lib/simulations/oral-exam";

const expected = [
  "doctrina policial",
  "principios",
  "valores",
  "conducta institucional",
];
const question = "Explique qué entiende usted por doctrina policial.";

describe("Sprint 4 simulacro oral inteligente", () => {
  it("CASO A: respuesta correcta obtiene valoración alta", () => {
    const result = oralExamTestUtils.heuristicEvaluateAnswer(
      question,
      "La doctrina policial orienta la conducta institucional mediante principios y valores que guían el servicio policial.",
      expected,
    );
    expect(result.score.total).toBeGreaterThanOrEqual(75);
    expect(result.missingConcepts.length).toBeLessThan(2);
  });

  it("CASO B: respuesta parcial identifica omisiones y repregunta", () => {
    const result = oralExamTestUtils.heuristicEvaluateAnswer(
      question,
      "La doctrina policial son principios que orientan al policía.",
      expected,
    );
    expect(result.score.total).toBeGreaterThan(20);
    expect(result.score.total).toBeLessThan(90);
    expect(result.missingConcepts).toContain("valores");
    expect(result.needsFollowUp).toBe(true);
    expect(result.correctAnswer).toContain("doctrina policial");
    expect(result.didacticExample).toContain("Ejemplo didáctico generado");
  });

  it("CASO C: respuesta incorrecta o no respaldada no inventa contenido", () => {
    const result = oralExamTestUtils.heuristicEvaluateAnswer(
      question,
      "La doctrina policial es solamente un trámite administrativo sin relación con principios ni conducta.",
      expected,
    );
    expect(result.missingConcepts).toContain("valores");
    expect(result.needsFollowUp).toBe(true);
  });

  it("CASO D: respuesta muy breve se maneja sin romper el flujo", () => {
    const result = oralExamTestUtils.heuristicEvaluateAnswer(
      question,
      "No sé.",
      expected,
    );
    expect(result.score.total).toBeLessThan(20);
    expect(result.misconceptions[0]).toContain("insuficiente");
    expect(result.needsFollowUp).toBe(true);
  });

  it("CASO E: reconoce comprensión aunque no copie literalmente", () => {
    const result = oralExamTestUtils.heuristicEvaluateAnswer(
      question,
      "Es una guía institucional que reúne valores y principios para orientar cómo debe actuar el servidor policial.",
      expected,
    );
    expect(result.score.total).toBeGreaterThan(60);
    expect(result.improvements.join(" ")).not.toContain("memorizar");
  });

  it("calcula la rúbrica completa sobre 100", () => {
    const score = oralExamTestUtils.makeScore({
      conceptual: 30,
      application: 20,
      terminology: 20,
      argumentation: 20,
      clarity: 10,
    });
    expect(score.total).toBe(100);
  });

  it("prioriza un simulacro nuevo sobre el intento anterior respondido", () => {
    const previous = makeSimulation("anterior", "completed");
    const next = makeSimulation("nuevo", "in_progress");

    expect(selectVisibleSimulation(previous, next, previous)?.id).toBe(
      "nuevo",
    );
  });
});

function makeSimulation(
  id: string,
  status: SimulationState["status"],
): SimulationState {
  return {
    id,
    status,
    difficulty: "intermedio",
    unit_number: 1,
    unit_name: "Doctrina Policial",
    question_count: 3,
    main_answered: status === "completed" ? 3 : 0,
    progress_label: "Pregunta 1 de 3",
    session_id: null,
    questions: [],
    result: null,
  };
}
