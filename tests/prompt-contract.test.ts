import { describe, expect, it } from "vitest";
import { TUTOR_SYSTEM_PROMPT } from "@/prompts/tutor-system";

describe("contrato pedagogico del tutor", () => {
  it("separa compendio, explicacion y ejemplo didactico generado", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("contenido del compendio");
    expect(TUTOR_SYSTEM_PROMPT).toContain("explicacion pedagogica generada");
    expect(TUTOR_SYSTEM_PROMPT).toContain("ejemplo didactico generado");
  });

  it("adapta el orden de respuesta a la intencion del estudiante", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("Si pide un ejemplo");
    expect(TUTOR_SYSTEM_PROMPT).toContain("empieza con un ejemplo didactico claro");
    expect(TUTOR_SYSTEM_PROMPT).toContain("No obligues siempre el orden A-B-C");
  });

  it("prohibe inventar informacion oficial no respaldada", () => {
    for (const term of [
      "normas",
      "articulos",
      "procedimientos",
      "fechas",
      "competencias",
      "sanciones",
      "atribuciones",
      "definiciones oficiales",
    ]) {
      expect(TUTOR_SYSTEM_PROMPT).toContain(term);
    }
    expect(TUTOR_SYSTEM_PROMPT).toContain("no respalda una afirmacion");
  });
});
