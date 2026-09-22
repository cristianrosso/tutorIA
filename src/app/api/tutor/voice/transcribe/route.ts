import { NextResponse } from "next/server";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { accessProblem } from "@/lib/auth/rules";
import { getCurrentProfile } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  durationFromForm,
  transcribeStudentAudio,
} from "@/lib/voice/speech-to-text";

export const runtime = "nodejs";

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "ESTUDIANTE" || accessProblem(profile)) {
      return fail(
        "Inicia sesión como estudiante para usar el tutor de voz.",
        401,
      );
    }
    if (!(await consumeLimit(`voice-transcribe:${profile.id}`, 10, 60))) {
      return fail("Espera un minuto antes de enviar más audios.", 429);
    }
    const form = await request.formData();
    const audio = form.get("audio");
    const duration = durationFromForm(form.get("duration"));
    if (!(audio instanceof File))
      return fail("No se recibió audio para transcribir.");
    const transcription = await transcribeStudentAudio({
      audio,
      durationSeconds: duration,
      language: "es",
    });
    await createSupabaseAdmin().from("usage_events").insert({
      user_id: profile.id,
      provider: "openai",
      model: transcription.model,
      event_type: "stt",
      input_tokens: transcription.inputTokens,
      output_tokens: transcription.outputTokens,
      audio_input: transcription.audioInputSeconds,
      audio_output: 0,
      estimated_cost: transcription.estimatedCost,
      provider_request_id: transcription.requestId,
    });
    return NextResponse.json({
      transcript: transcription.transcript,
      model: transcription.model,
      audioInputSeconds: transcription.audioInputSeconds,
    });
  } catch (error) {
    return fail(voiceErrorMessage(error), 500);
  }
}

function voiceErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/OPENAI_API_KEY/.test(message))
    return "La clave de OpenAI no está configurada en el servidor.";
  if (/OpenAI.*estado 401|OpenAI.*estado 403/.test(message))
    return "OpenAI rechazó la clave configurada en el servidor.";
  if (/OpenAI.*estado 429|quota|billing|insufficient/i.test(message))
    return "OpenAI rechazó la solicitud por límite, cuota o facturación.";
  if (message) return message;
  return "No se pudo transcribir el audio. Intenta hablar más cerca del micrófono o escribe tu pregunta.";
}
