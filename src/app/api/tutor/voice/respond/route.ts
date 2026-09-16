import { NextResponse } from "next/server";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { accessProblem } from "@/lib/auth/rules";
import { getCurrentProfile } from "@/lib/auth/session";
import { estimateAudioInputCost } from "@/lib/ai/costs";
import { transcribeAudio } from "@/lib/ai/openai";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { answerTutorQuestion, detectTutorIntent } from "@/lib/rag/tutor";

export const runtime = "nodejs";

const maxAudioBytes = 8 * 1024 * 1024;
const maxInputSeconds = 75;
const minAudioBytes = 250;

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function clampDuration(value: FormDataEntryValue | null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(maxInputSeconds, number));
}

export async function POST(request: Request) {
  try {
    const profile = await getCurrentProfile();
    if (!profile || profile.role !== "ESTUDIANTE" || accessProblem(profile))
      return fail(
        "Inicia sesión como estudiante para usar el tutor de voz.",
        401,
      );
    if (!(await consumeLimit(`voice:${profile.id}`, 8, 60)))
      return fail("Espera un minuto antes de enviar más audios.", 429);
    const form = await request.formData();
    const audio = form.get("audio");
    const sessionId = form.get("conversationId");
    const unitNumber = Math.min(
      15,
      Math.max(1, Number(form.get("unitNumber")) || 1),
    );
    const section =
      typeof form.get("section") === "string"
        ? String(form.get("section")).slice(0, 180)
        : undefined;
    const duration = clampDuration(form.get("duration"));
    if (!(audio instanceof File))
      return fail("No se recibió audio para transcribir.");
    if (audio.size < minAudioBytes)
      return fail(
        `El audio llegó vacío o incompleto (${audio.size} bytes). Revisa el permiso del micrófono e intenta otra vez.`,
      );
    if (audio.size > maxAudioBytes || duration >= maxInputSeconds)
      return fail(
        "El audio es muy largo. Usa intervenciones de hasta un minuto.",
      );

    const transcription = await transcribeAudio({ audio, language: "es" });
    const transcript = transcription.text.trim();
    if (transcript.length < 3)
      return fail("No pude reconocer una pregunta en el audio.");

    const result = await answerTutorQuestion({
      profile,
      question: transcript,
      unitNumber,
      section,
      sessionId:
        typeof sessionId === "string" && sessionId.length > 20
          ? sessionId
          : undefined,
      mode: "voice",
      intent: detectTutorIntent(transcript),
    });

    await createSupabaseAdmin()
      .from("usage_events")
      .insert({
        user_id: profile.id,
        session_id: result.sessionId,
        provider: "openai",
        unit_id: result.unitId,
        feature: "tutor_voice",
        model: transcription.model,
        event_type: "stt",
        input_tokens: transcription.inputTokens,
        output_tokens: transcription.outputTokens,
        audio_input: duration,
        audio_output: 0,
        estimated_cost: estimateAudioInputCost(duration),
        provider_request_id: transcription.requestId,
      });

    return NextResponse.json({
      conversationId: result.sessionId,
      transcript,
      answer: result.answer,
      sources: result.sources.map((source) => ({
        title: source.title,
        source: source.source,
        unitName: source.unitName,
        section: source.section,
        sectionName: source.sectionName,
        page: source.page,
        score: source.score,
      })),
      models: {
        stt: transcription.model,
        tutor: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      },
      usage: {
        sttInputTokens: transcription.inputTokens,
        sttOutputTokens: transcription.outputTokens,
        audioInputSeconds: duration,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && /OPENAI_API_KEY/.test(error.message)
        ? "La clave de OpenAI no está configurada en el servidor."
        : "No se pudo procesar el audio. Verifica tu conexión e inténtalo nuevamente.";
    return fail(message, 500);
  }
}
