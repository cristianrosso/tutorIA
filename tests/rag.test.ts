import { describe, expect, it } from "vitest";
import { splitDocument, tokenize } from "@/lib/rag/chunk";
import { buildTutorContext, detectTutorIntent } from "@/lib/rag/tutor";
import type { RetrievedSource } from "@/lib/rag/retrieve";

describe("infraestructura RAG Sprint 2", () => {
  it("fragmenta texto por bloques sin inventar metadata academica", () => {
    const chunks = splitDocument(`
1. DISCIPLINA POLICIAL

La disciplina policial es un concepto de prueba usado para validar fragmentacion. Este texto no pretende definir doctrina oficial.

1.1 APLICACION

El contenido se conserva como fue cargado y se divide sin completar informacion faltante.
    `);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].metadata.generated).toBe(false);
    expect(chunks.map((chunk) => chunk.chunk_index)).toEqual(
      chunks.map((_, index) => index),
    );
  });

  it("normaliza tokens para recuperar conceptos relevantes", () => {
    expect(tokenize("¿Qué es la disciplina policial?")).toEqual([
      "disciplina",
      "policial",
    ]);
  });

  it("construye contexto separando fuentes e instrucciones pedagogicas", () => {
    const source: RetrievedSource = {
      chunkId: "chunk",
      documentId: "doc",
      title: "Compendio",
      source: "Fuente oficial",
      version: "2026",
      unitName: "Doctrina Policial",
      section: "1.1",
      sectionName: "Concepto",
      page: 3,
      content: "Contenido oficial de prueba.",
      score: 2,
    };
    const context = buildTutorContext("Explicame disciplina", [source]);
    expect(context).toContain("Contexto recuperado del compendio");
    expect(context).toContain("Fuente 1");
    expect(context).toContain("explicacion pedagogica");
    expect(context).toContain("ejemplo didactico generado");
  });

  it("mantiene contexto conversacional para repreguntas de voz", () => {
    const source: RetrievedSource = {
      chunkId: "chunk",
      documentId: "doc",
      title: "Compendio",
      source: "Fuente oficial",
      version: "2026",
      unitName: "Doctrina Policial",
      section: "1.2.3",
      sectionName: "Doctrina",
      page: null,
      content: "La doctrina policial integra principios, valores e historia.",
      score: 3,
    };
    const context = buildTutorContext("Dame un ejemplo.", [source], {
      conversationContext: "Estudiante: ¿Qué es la doctrina policial?",
      intent: "ejemplo",
      voice: true,
    });
    expect(context).toContain("Contexto conversacional breve");
    expect(context).toContain("Intencion detectada: ejemplo");
    expect(context).toContain("Empieza con un ejemplo didactico generado");
    expect(context).toContain("No empieces con A) CONTENIDO DEL COMPENDIO");
    expect(context).toContain("Esta respuesta sera hablada");
    expect(context).toContain("30 y 60 segundos");
  });

  it("detecta intenciones pedagogicas sencillas", () => {
    expect(detectTutorIntent("Explícamelo más fácil")).toBe("no_entendi");
    expect(detectTutorIntent("Dame un ejemplo")).toBe("ejemplo");
    expect(detectTutorIntent("Dame otro ejemplo")).toBe("otro_ejemplo");
    expect(detectTutorIntent("¿Cómo respondo en mi examen?")).toBe("examen");
    expect(detectTutorIntent("Pregúntame")).toBe("pregunta");
  });
});
