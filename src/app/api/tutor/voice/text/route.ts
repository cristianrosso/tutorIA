import { NextResponse } from "next/server";
import { z } from "zod";
import { accessProblem } from "@/lib/auth/rules";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { getCurrentProfile } from "@/lib/auth/session";
import { answerTutorQuestion, detectTutorIntent } from "@/lib/rag/tutor";

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
    const result = await answerTutorQuestion({
      profile,
      question: parsed.data.transcript,
      unitNumber: parsed.data.unitNumber,
      section: parsed.data.section,
      sessionId: parsed.data.conversationId,
      mode: "voice",
      intent: detectTutorIntent(parsed.data.transcript),
    });
    return NextResponse.json({
      conversationId: result.sessionId,
      transcript: parsed.data.transcript,
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
        stt: "browser-web-speech",
        tutor: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      },
      usage: { audioInputSeconds: 0 },
    });
  } catch {
    return fail("No se pudo procesar la transcripción del navegador.", 500);
  }
}
