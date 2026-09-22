import { NextResponse } from "next/server";
import { z } from "zod";
import { accessProblem } from "@/lib/auth/rules";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { getCurrentProfile } from "@/lib/auth/session";
import { generateTutorResponse, type TutorStructuredSource } from "@/lib/tutor/tutor-service";

export const runtime = "nodejs";

const schema = z.object({
  transcript: z.string().trim().min(3).max(1000),
  conversationId: z.string().uuid().optional(),
  unitNumber: z.coerce.number().int().min(1).max(15).default(1),
  section: z.string().trim().max(180).optional(),
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
    if (!(await consumeLimit(`voice-text:${profile.id}`, 8, 60)))
      return fail("Espera un minuto antes de enviar más preguntas.", 429);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success)
      return fail("No se reconoció una pregunta de voz utilizable.");
    const result = await generateTutorResponse({
      profile,
      conversationId: parsed.data.conversationId,
      message: parsed.data.transcript,
      mode: tutorModeFromTranscript(parsed.data.transcript),
      options: { unitNumber: parsed.data.unitNumber },
    });
    return NextResponse.json({
      conversationId: result.conversationId,
      transcript: parsed.data.transcript,
      answer: result.answer,
      sources: result.sources.map(toVoiceSource),
      models: {
        stt: "browser-web-speech",
        tutor: result.usage.model,
      },
      usage: { ...result.usage, audioInputSeconds: 0 },
    });
  } catch (error) {
    console.error("voice-text failed", error);
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
  if (/No se encontró la unidad|sesión|conversación/i.test(message))
    return message;
  return "No se pudo consultar el tutor con la transcripción del navegador. Intenta por texto o avísame para revisar logs.";
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
