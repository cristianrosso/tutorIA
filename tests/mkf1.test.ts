import { describe, expect, it } from "vitest";
import { KnowledgeObjectSchema } from "@/lib/mkf1/schema";
import { detectUnits, runMkfPipeline } from "@/lib/mkf1/pipeline";
import { OFFICIAL_UNITS } from "@/lib/units";

function fixtureCompendium() {
  return OFFICIAL_UNITS.map(
    (unit) => `UNIDAD TEMÁTICA ${unit.number}\n${unit.name}\n\n${unit.number}.1 CONCEPTO PRINCIPAL\nSe define ${unit.name} como contenido académico de prueba para conservar literalmente.\n\n${unit.number}.2 PRINCIPIOS\nPrincipios principales:\n- Disciplina\n- Legalidad\n- Transparencia\n\n${unit.number}.3 PROCEDIMIENTO\nPrimero: identificar el concepto.\nSegundo: explicar su aplicación policial.\nTercero: responder oralmente con orden.`,
  ).join("\n\n");
}

describe("MKF-1", () => {
  it("detecta exactamente las 15 unidades oficiales en la pasada estructural", () => {
    const detected = detectUnits(fixtureCompendium());
    expect(detected).toHaveLength(15);
    expect(detected.map((item) => item.unit.number)).toEqual(
      OFFICIAL_UNITS.map((unit) => unit.number),
    );
  });

  it("crea objetos validables sin reescribir source_content", () => {
    const result = runMkfPipeline(fixtureCompendium());
    expect(result.detected_units).toBe(15);
    expect(result.errors).toHaveLength(0);
    expect(result.knowledge_objects.length).toBeGreaterThan(15);
    const sample = result.knowledge_objects[0];
    expect(() => KnowledgeObjectSchema.parse(sample)).not.toThrow();
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    expect(normalize(fixtureCompendium())).toContain(
      normalize(sample.knowledge.source_content),
    );
    expect(sample.validation.source_preserved).toBe(true);
    expect(sample.provenance.scope).not.toBe("AI_GENERATED");
  });

  it("marca revisión cuando la clasificación o jerarquía tiene baja confianza", () => {
    const result = runMkfPipeline(
      OFFICIAL_UNITS.map(
        (unit) => `UNIDAD TEMÁTICA ${unit.number}\n${unit.name}\n\nTexto breve sin encabezado claro y sin clasificación evidente para revisión humana.`,
      ).join("\n\n"),
    );
    expect(result.detected_units).toBe(15);
    expect(
      result.knowledge_objects.some(
        (object) => object.validation.requires_review,
      ),
    ).toBe(true);
  });
});
