import { describe, expect, it } from "vitest";
import {
  durationFromForm,
  normalizeTranscript,
  validateAudio,
} from "@/lib/voice/speech-to-text";
import { normalizeSpeechText } from "@/lib/voice/text-to-speech";

describe("Sprint 12 voice helpers", () => {
  it("normaliza transcripciones sin cambiar términos académicos", () => {
    expect(normalizeTranscript("  doctrina   policial y   archivística ")).toBe(
      "doctrina policial y archivística",
    );
  });

  it("valida audio compatible y rechaza audio vacío", () => {
    const ok = new File([new Uint8Array(1200)], "respuesta.webm", {
      type: "audio/webm",
    });
    expect(() => validateAudio(ok, 4)).not.toThrow();
    const empty = new File([new Uint8Array(10)], "respuesta.webm", {
      type: "audio/webm",
    });
    expect(() => validateAudio(empty, 4)).toThrow(/vacío|incompleto/);
  });

  it("limpia markdown y enlaces para lectura oral", () => {
    expect(
      normalizeSpeechText("**Concepto** | ver https://example.com ahora"),
    ).toBe("Concepto , ver enlace disponible en pantalla ahora");
  });

  it("limita la duración declarada desde formulario", () => {
    expect(durationFromForm("4.4")).toBe(4);
    expect(durationFromForm("999")).toBeLessThanOrEqual(75);
    expect(durationFromForm("no-numero")).toBe(0);
  });
});
