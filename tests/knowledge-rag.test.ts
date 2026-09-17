import { describe, expect, it } from "vitest";
import { analyzeQuery } from "@/lib/knowledge/query-analyzer";
import { rerankCandidates } from "@/lib/knowledge/reranker";
import { buildAcademicContext } from "@/lib/knowledge/context-builder";
import type { KnowledgeChunkCandidate } from "@/lib/knowledge/types";

function candidate(overrides: Partial<KnowledgeChunkCandidate>): KnowledgeChunkCandidate {
  return {
    chunkId: overrides.chunkId || "chunk",
    knowledgeObjectId: overrides.knowledgeObjectId || "U12-LIDERAZGO",
    parentId: overrides.parentId || null,
    unitId: overrides.unitId || "unit",
    unitNumber: overrides.unitNumber ?? 12,
    unitName: overrides.unitName || "Expresión Oral, Ética y Relaciones Humanas",
    topicId: overrides.topicId || "topic",
    topicName: overrides.topicName || "Liderazgo",
    sectionName: overrides.sectionName || "Concepto de liderazgo",
    title: overrides.title || "Liderazgo policial",
    content: overrides.content || "El liderazgo orienta e influye en el grupo para alcanzar objetivos institucionales.",
    sourceText: overrides.sourceText || overrides.content || "El liderazgo orienta e influye en el grupo para alcanzar objetivos institucionales.",
    sourceReference: overrides.sourceReference || "Compendio FATESCIPOL",
    pageReference: overrides.pageReference || null,
    keywords: overrides.keywords || ["liderazgo", "grupo", "objetivos"],
    semanticScore: overrides.semanticScore ?? 0.4,
    lexicalScore: overrides.lexicalScore ?? 0.4,
    academicScore: overrides.academicScore ?? 0.3,
    finalScore: overrides.finalScore ?? 0.45,
    source: overrides.source || "lexical",
  };
}

describe("motor RAG academico Sprint 5B", () => {
  it("analiza intención académica y unidad probable", () => {
    expect(analyzeQuery("¿Cuáles son las características del liderazgo?").intent).toBe("enumeration");
    expect(analyzeQuery("Dame un ejemplo de liderazgo democrático").intent).toBe("example");
    expect(analyzeQuery("Explícame la diferencia entre oficio y memorándum").intent).toBe("comparison");
    expect(analyzeQuery("Explícame expresión oral").probableUnitNumber).toBe(12);
  });

  it("rerank favorece coincidencia de título, keywords y tipo de intención", () => {
    const weak = candidate({ chunkId: "weak", title: "Archivo", finalScore: 0.5, content: "Texto general." });
    const strong = candidate({ chunkId: "strong", title: "Características del liderazgo", finalScore: 0.45, content: "Características del liderazgo policial: comunicación, ejemplo y orientación." });
    const ranked = rerankCandidates("características del liderazgo", [weak, strong], analyzeQuery("características del liderazgo"));
    expect(ranked[0].chunkId).toBe("strong");
  });

  it("construye contexto con trazabilidad y sin duplicados", () => {
    const analysis = analyzeQuery("¿Qué es liderazgo?");
    const repeated = candidate({ chunkId: "a" });
    const context = buildAcademicContext(analysis, [repeated, { ...repeated, chunkId: "b" }]);
    expect(context.sources).toHaveLength(1);
    expect(context.context).toContain("<academic_context>");
    expect(context.context).toContain("Unidad: 12");
    expect(context.context).toContain("Knowledge Object: U12-LIDERAZGO");
    expect(context.context).toContain("Contenido oficial:");
  });
});
