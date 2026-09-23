import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { accessProblem } from "@/lib/auth/rules";
import { getCurrentProfile } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { generateSpeechAudio } from "@/lib/voice/text-to-speech";
import {
  cachedSpeechResponse,
  cacheKeyForSpeech,
  getCachedSpeech,
  rememberSpeech,
} from "@/lib/voice/speech-cache";

export const runtime = "nodejs";

const speechSchema = z.object({
  conversationId: z.string().uuid(),
  text: z.string().trim().min(10).max(4500),
});

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "ESTUDIANTE" || accessProblem(profile))
      return fail(
        "Inicia sesión como estudiante para usar el tutor de voz.",
        401,
      );
    if (!(await consumeLimit(`voice-tts:${profile.id}`, 10, 60)))
      return fail("Espera un minuto antes de generar más audios.", 429);
    const parsed = speechSchema.safeParse(await request.json());
    if (!parsed.success)
      return fail("No se recibió una respuesta válida para reproducir.");

    const { data: conversation, error: conversationError } =
      await createSupabaseAdmin()
        .from("tutor_conversations")
        .select("id")
        .eq("id", parsed.data.conversationId)
        .eq("user_id", profile.id)
        .maybeSingle();
    if (conversationError || !conversation)
      return fail("No se encontró la conversación activa.", 404);

    const cacheKey = cacheKeyForSpeech([
      "tutor",
      profile.id,
      parsed.data.conversationId,
      parsed.data.text,
    ]);
    const cached = getCachedSpeech(cacheKey);
    if (cached) return cachedSpeechResponse(cached);

    const speech = await generateSpeechAudio({
      text: parsed.data.text,
      style: "tutor",
    });
    const outputSeconds = speech.audioOutputSeconds;
    await createSupabaseAdmin().from("usage_events").insert({
      user_id: profile.id,
      session_id: null,
      provider: "openai",
      model: speech.model,
      event_type: "tts",
      input_tokens: speech.inputTokens,
      output_tokens: speech.outputTokens,
      audio_input: 0,
      audio_output: outputSeconds,
      estimated_cost: speech.estimatedCost,
      provider_request_id: speech.requestId,
    });

    rememberSpeech(cacheKey, {
      audio: speech.audio,
      contentType: speech.contentType,
      model: speech.model,
      outputSeconds,
      createdAt: Date.now(),
    });

    return new Response(speech.audio, {
      headers: {
        "Content-Type": speech.contentType,
        "Cache-Control": "private, max-age=900",
        "X-Audio-Seconds": String(outputSeconds),
        "X-OpenAI-Model": speech.model,
        "X-Voice-Cache": "MISS",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && /OPENAI_API_KEY/.test(error.message)
        ? "La clave de OpenAI no está configurada en el servidor."
        : "No se pudo generar el audio de respuesta. Puedes leer la respuesta en pantalla.";
    return fail(message, 500);
  }
}
