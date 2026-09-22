import { NextResponse } from "next/server";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { accessProblem } from "@/lib/auth/rules";
import { getCurrentProfile } from "@/lib/auth/session";
import { estimateAudioInputCost } from "@/lib/ai/costs";
import { transcribeAudio } from "@/lib/ai/openai";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { generateTutorResponse, type TutorStructuredSource } from "@/lib/tutor/tutor-service";

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

    const result = await generateTutorResponse({
      profile,
      conversationId:
        typeof sessionId === "string" && sessionId.length > 20
          ? sessionId
          : undefined,
      message: transcript,
      mode: tutorModeFromTranscript(transcript),
      options: { unitNumber },
    });

    await createSupabaseAdmin()
      .from("usage_events")
      .insert({
        user_id: profile.id,
        session_id: result.conversationId,
        provider: "openai",
        unit_id: null,
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
      conversationId: result.conversationId,
      transcript,
      answer: result.answer,
      sources: result.sources.map(toVoiceSource),
      models: {
        stt: transcription.model,
        tutor: result.usage.model,
      },
      usage: {
        ...result.usage,
        sttInputTokens: transcription.inputTokens,
        sttOutputTokens: transcription.outputTokens,
        audioInputSeconds: duration,
      },
    });
  } catch (error) {
    console.error("voice-audio failed", error);
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
  if (/OpenAI STT/.test(message))
    return "No se pudo transcribir el audio con OpenAI. Intenta hablar más cerca del micrófono o prueba por texto.";
  return "No se pudo procesar el audio. Verifica tu conexión e inténtalo nuevamente.";
}


function tutorModeFromTranscript(transcript: string) {
  if (/ejemplo/i.test(transcript)) return "example" as const;
  if (/examen|oral|respuesta modelo|tribunal/i.test(transcript)) return "review" as const;
  if (/f[aá]cil|no entend[ií]|expl[ií]came/i.test(transcript)) return "explain" as const;
  if (/preg[uú]ntame/i.test(transcript)) return "review" as const;
  return "normal" as const;
}

function toVoiceSource(source: TutorStructuredSource) {
  return {
    title: source.topicName || source.sectionName || source.unitName || "Compendio FATESCIPOL 2026",
    source: "Compendio FATESCIPOL 2026",
    unitName: source.unitName,
    section: source.reference,
    sectionName: source.sectionName || source.topicName,
    page: null,
    score: source.score,
  };
}
