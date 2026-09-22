import { describe, expect, it } from "vitest";
import { detectPedagogicalMode } from "@/lib/pedagogy/mode-detector";
import {
  buildMultilevelPedagogicalPrompt,
  maxTokensForMode,
} from "@/lib/pedagogy/prompt-builder";
import { selectPedagogicalStrategy } from "@/lib/pedagogy/strategy-selector";
import type { KnowledgeChunkCandidate } from "@/lib/knowledge/types";

const source: KnowledgeChunkCandidate = {
  chunkId: "chunk-1",
  knowledgeObjectId: "U02-PATRULLAJE",
  parentId: null,
  unitId: "unit-2",
  unitNumber: 2,
  unitName: "Patrullaje Policial",
  topicId: "topic-1",
  topicName: "Patrullaje comunitario",
  sectionName: "Finalidad del patrullaje",
  title: "Patrullaje comunitario",
  content:
    "La policia comunitaria promueve el trabajo conjunto con vecinos para prevenir delitos.",
  sourceText:
    "La policia comunitaria promueve el trabajo conjunto con vecinos para prevenir delitos.",
  sourceReference: "Unidad 2",
  pageReference: null,
  keywords: ["patrullaje", "comunitario"],
  semanticScore: 0.8,
  lexicalScore: 0.7,
  academicScore: 0.9,
  finalScore: 0.85,
  source: "semantic",
};

describe("Sprint 11 motor pedagogico multinivel", () => {
  it("detecta modos por lenguaje natural", () => {
    expect(
      detectPedagogicalMode({
        message: "Explícamelo más fácil",
        requestedMode: "normal",
      }).mode,
    ).toBe("simple");
    expect(
      detectPedagogicalMode({
        message: "Dame un ejemplo en La Paz",
        requestedMode: "normal",
      }).mode,
    ).toBe("example");
    expect(
      detectPedagogicalMode({
        message: "Explícalo paso a paso",
        requestedMode: "normal",
      }).mode,
    ).toBe("step_by_step");
    expect(
      detectPedagogicalMode({
        message: "Compara doctrina y disciplina",
        requestedMode: "normal",
      }).mode,
    ).toBe("comparison");
  });

  it("prioriza la seleccion manual del estudiante", () => {
    const result = detectPedagogicalMode({
      message: "Dame una respuesta breve",
      requestedMode: "deep",
      preference: { preferredMode: "simple" },
    });
    expect(result.mode).toBe("deep");
    expect(result.confidence).toBe(1);
  });

  it("selecciona estrategias sin llamadas adicionales a IA", () => {
    expect(
      selectPedagogicalStrategy({
        query: "Dame un ejemplo",
        mode: "example",
        queryIntent: "example",
        availableSources: [source],
      }),
    ).toBe("PRACTICAL_EXAMPLE");
    expect(
      selectPedagogicalStrategy({
        query: "No entendí",
        mode: "simple",
        queryIntent: "explanation",
        availableSources: [source],
        reformulationRequested: true,
      }),
    ).toBe("PROGRESSIVE_EXPLANATION");
  });

  it("construye un prompt que exige fuente y ejemplo didactico separado", () => {
    const prompt = buildMultilevelPedagogicalPrompt({
      query: "Dame un ejemplo de policía comunitaria",
      mode: "example",
      queryIntent: "example",
      context: source.sourceText,
      history: "Sin historial.",
      memoryContext: "Sin memoria.",
      adaptiveContext: "Sin recomendaciones.",
      studyPlanContext: "Sin plan.",
      academicMemory: "Sin memoria.",
      availableSources: [source],
      strategy: "PRACTICAL_EXAMPLE",
    });
    expect(prompt).toContain("Ejemplo didáctico");
    expect(prompt).toContain("Compendio FATESCIPOL 2026");
    expect(prompt).toContain("No inventes normas");
  });

  it("limita tokens segun profundidad", () => {
    expect(maxTokensForMode("quick")).toBeLessThan(maxTokensForMode("deep"));
    expect(maxTokensForMode("example")).toBeLessThan(maxTokensForMode("deep"));
  });
});
