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

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "ESTUDIANTE" || accessProblem(profile))
      return fail(
        "Inicia sesión como estudiante para responder el simulacro.",
        401,
      );
    if (!(await consumeLimit(`exam-stt:${profile.id}`, 10, 60)))
      return fail("Espera un minuto antes de enviar más audios.", 429);
    const { id } = await context.params;
    const db = createSupabaseAdmin();
    const { data: exam, error } = await db
      .from("exam_sessions")
      .select("id,status")
      .eq("id", id)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (error || !exam) return fail("No se encontró el simulacro activo.", 404);
    if (exam.status !== "in_progress")
      return fail("El simulacro no está en desarrollo.");
    const form = await request.formData();
    const audio = form.get("audio");
    const duration = durationFromForm(form.get("duration"));
    if (!(audio instanceof File)) return fail("No se recibió audio.");
    const transcription = await transcribeStudentAudio({
      audio,
      durationSeconds: duration,
      language: "es",
    });
    await db.from("usage_events").insert({
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
    const message =
      error instanceof Error && error.message
        ? error.message
        : "No se pudo transcribir tu respuesta. Puedes escribirla manualmente.";
    return fail(message, 500);
  }
}
