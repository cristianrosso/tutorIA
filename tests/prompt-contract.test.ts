import { describe, expect, it } from "vitest";
import { TUTOR_SYSTEM_PROMPT } from "@/prompts/tutor-system";

describe("contrato pedagogico del tutor", () => {
  it("separa compendio, explicacion y ejemplo didactico generado", () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain("CONTENIDO DEL COMPENDIO");
    expect(TUTOR_SYSTEM_PROMPT).toContain("EXPLICACION PEDAGOGICA GENERADA");
    expect(TUTOR_SYSTEM_PROMPT).toContain("EJEMPLO DIDACTICO GENERADO");
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
