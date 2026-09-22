import "server-only";
import { estimateAudioOutputCost, estimateSpeechSeconds } from "@/lib/ai/costs";
import { synthesizeSpeech } from "@/lib/ai/openai";

export type TextToSpeechResult = {
  audio: ArrayBuffer;
  contentType: string;
  model: string;
  requestId: string | null;
  inputTokens: number;
  outputTokens: number;
  audioOutputSeconds: number;
  estimatedCost: number;
};

export async function generateSpeechAudio(input: {
  text: string;
  voice?: string;
  format?: string;
  style?: "tutor" | "examiner" | "feedback";
}): Promise<TextToSpeechResult> {
  const text = normalizeSpeechText(input.text);
  if (!text) throw new Error("No se puede generar audio de un texto vacío.");
  if (text.length > 4096)
    throw new Error(
      "La respuesta es demasiado larga para reproducirla por voz. Lee el texto completo en pantalla.",
    );
  const speech = await synthesizeSpeech({
    text,
    voice: input.voice,
    format: input.format,
    instructions: speechInstructions(input.style || "tutor"),
  });
  const audioOutputSeconds = estimateSpeechSeconds(text);
  return {
    ...speech,
    audioOutputSeconds,
    estimatedCost: estimateAudioOutputCost(audioOutputSeconds),
  };
}

export function normalizeSpeechText(text: string) {
  return text
    .replace(/\*\*/g, "")
    .replace(/[`#>]/g, "")
    .replace(/https?:\/\/\S+/g, "enlace disponible en pantalla")
    .replace(/\|/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function speechInstructions(style: "tutor" | "examiner" | "feedback") {
  if (style === "examiner") {
    return "Voz clara, formal y pausada de tribunal académico. Pronuncia la pregunta con naturalidad, sin intimidar al estudiante.";
  }
  if (style === "feedback") {
    return "Voz docente, clara y constructiva. Explica la retroalimentación con pausas naturales y tono de apoyo académico.";
  }
  return "Voz clara, natural y pausada para un estudiante policial boliviano. Mantén tono docente, breve, profesional y seguro.";
}
