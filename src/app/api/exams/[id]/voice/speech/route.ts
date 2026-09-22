import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { accessProblem } from "@/lib/auth/rules";
import { getCurrentProfile } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { generateSpeechAudio } from "@/lib/voice/text-to-speech";

export const runtime = "nodejs";

const schema = z.object({
  questionId: z.string().uuid().optional(),
  text: z.string().trim().min(5).max(1600),
  style: z.enum(["examiner", "feedback"]).default("examiner"),
});

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
      return fail("Inicia sesión como estudiante para usar el simulacro.", 401);
    if (!(await consumeLimit(`exam-tts:${profile.id}`, 16, 60)))
      return fail("Espera un minuto antes de generar más audios.", 429);
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return fail("No se recibió un texto válido para reproducir.");
    const db = createSupabaseAdmin();
    const { data: exam, error } = await db
      .from("exam_sessions")
      .select("id,status")
      .eq("id", id)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (error || !exam) return fail("No se encontró el simulacro.", 404);
    const speech = await generateSpeechAudio({
      text: parsed.data.text,
      style: parsed.data.style,
    });
    await db.from("usage_events").insert({
      user_id: profile.id,
      provider: "openai",
      model: speech.model,
      event_type: "tts",
      input_tokens: speech.inputTokens,
      output_tokens: speech.outputTokens,
      audio_input: 0,
      audio_output: speech.audioOutputSeconds,
      estimated_cost: speech.estimatedCost,
      provider_request_id: speech.requestId,
    });
    return new Response(speech.audio, {
      headers: {
        "Content-Type": speech.contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Audio-Seconds": String(speech.audioOutputSeconds),
        "X-OpenAI-Model": speech.model,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && /OPENAI_API_KEY/.test(error.message)
        ? "La clave de OpenAI no está configurada en el servidor."
        : "No se pudo generar el audio. Puedes leerlo en pantalla.";
    return fail(message, 500);
  }
}
