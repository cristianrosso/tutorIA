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

  it("CASO C2: no acepta fases ajenas al compendio como correctas", () => {
    const result = oralExamTestUtils.heuristicEvaluateAnswer(
      "¿Cuáles son las fases del ciclo de la doctrina?",
      "Las fases son introducción, desarrollo y desenlace.",
      [
        "Creación o Actualización",
        "Difusión",
        "Internalización",
        "Aplicación",
      ],
    );

    expect(result.score.total).toBeLessThan(30);
    expect(result.missingConcepts).toContain("Creación o Actualización");
    expect(result.missingConcepts).toContain("Difusión");
    expect(result.misconceptions.join(" ")).toContain(
      "no corresponde con los elementos del compendio",
    );
    expect(result.correctAnswer).toContain("Creación o Actualización");
  });

  it("CASO C3: corrige aplicación de la doctrina con contenido del compendio", () => {
    const result = oralExamTestUtils.heuristicEvaluateAnswer(
      "Explique la Aplicación de la doctrina policial.",
      "Su aporte a la gestión es el aporte de los valores a la gestión institucional.",
      [
        "Aplicación de la doctrina policial",
        "Puesta en práctica en la vida personal y profesional",
        "Resultados positivos que fortalezcan la imagen institucional",
      ],
      [
        {
          content:
            "1.2.11.4 Aplicación: La aplicación es la puesta en práctica de la doctrina policial en la vida personal y profesional del personal policial, buscando obtener resultados positivos que fortalezcan la imagen institucional.",
        },
      ],
    );

    expect(result.correctAnswer).toContain("puesta en práctica");
    expect(result.correctAnswer).toContain("vida personal y profesional");
    expect(result.didacticExplanation).toContain("conducta diaria");
    expect(result.policeApplication).toContain("actuación concreta");
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
