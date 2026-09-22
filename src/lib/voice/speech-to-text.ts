import "server-only";
import { estimateAudioInputCost } from "@/lib/ai/costs";
import { transcribeAudio as openAITranscribeAudio } from "@/lib/ai/openai";

export const voiceConfig = {
  maxRecordingSeconds: Number(process.env.VOICE_MAX_RECORDING_SECONDS || 75),
  maxAudioBytes: Number(process.env.VOICE_MAX_AUDIO_BYTES || 8 * 1024 * 1024),
  minAudioBytes: Number(process.env.VOICE_MIN_AUDIO_BYTES || 250),
  language: process.env.VOICE_LANGUAGE || "es",
};

const supportedAudioTypes = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/ogg",
];

export type SpeechToTextResult = {
  transcript: string;
  model: string;
  requestId: string | null;
  inputTokens: number;
  outputTokens: number;
  audioInputSeconds: number;
  estimatedCost: number;
};

export async function transcribeStudentAudio(input: {
  audio: File;
  durationSeconds: number;
  language?: string;
}): Promise<SpeechToTextResult> {
  validateAudio(input.audio, input.durationSeconds);
  const result = await openAITranscribeAudio({
    audio: input.audio,
    language: input.language || voiceConfig.language,
    prompt:
      "Contexto académico policial boliviano FATESCIPOL: archivística, memorándum, doctrina policial, patrullaje policial, gestión pública, normativa institucional, procedimientos administrativos, derechos humanos y terminología policial.",
  });
  return {
    transcript: normalizeTranscript(result.text),
    model: result.model,
    requestId: result.requestId,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    audioInputSeconds: input.durationSeconds,
    estimatedCost: estimateAudioInputCost(input.durationSeconds),
  };
}

export function validateAudio(audio: File, durationSeconds: number) {
  if (audio.size < voiceConfig.minAudioBytes) {
    throw new Error(`El audio llegó vacío o incompleto (${audio.size} bytes).`);
  }
  if (audio.size > voiceConfig.maxAudioBytes) {
    throw new Error(
      "El audio es demasiado pesado para una intervención. Graba una respuesta más breve.",
    );
  }
  if (durationSeconds > voiceConfig.maxRecordingSeconds) {
    throw new Error(
      `La intervención supera el límite técnico de ${voiceConfig.maxRecordingSeconds} segundos.`,
    );
  }
  const type = audio.type.toLowerCase();
  if (type && !supportedAudioTypes.some((item) => type.startsWith(item))) {
    throw new Error(
      "El formato de audio no es compatible. Usa Chrome/Android o graba en formato webm/mp4.",
    );
  }
}

export function normalizeTranscript(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function durationFromForm(value: FormDataEntryValue | null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(
    0,
    Math.min(voiceConfig.maxRecordingSeconds, Math.round(number)),
  );
}
