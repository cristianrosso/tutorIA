import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { generateTutorResponse } from "@/lib/tutor/tutor-service";
import { createAssessmentSession } from "@/lib/assessment/question-generator";
import { getAssessmentSession } from "@/lib/assessment/session-service";

const chatSchema = z.object({
  conversationId: z.uuid().optional().nullable(),
  message: z.string().trim().min(3).max(1200),
  mode: z.enum(["normal", "quick", "explain", "example", "review"]).default("normal"),
  unitNumber: z.number().int().min(1).max(15).optional(),
  debug: z.boolean().optional(),
});

export async function POST(request: Request) {
  const profile = await requireStudent();
  const parsed = chatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Escribe una pregunta concreta para el tutor." },
      { status: 400 },
    );
  }
  try {
    if (isAssessmentRequest(parsed.data.message)) {
      const sessionId = await createAssessmentSession({
        profile,
        unitNumber: parsed.data.unitNumber || 1,
        questionType: questionTypeFromMessage(parsed.data.message),
        difficulty: difficultyFromMessage(parsed.data.message),
        count: countFromMessage(parsed.data.message),
      });
      const session = await getAssessmentSession(profile, sessionId);
      return NextResponse.json({
        conversationId: parsed.data.conversationId || session.id,
        messageId: session.id,
        answer: `Preparé una evaluación formativa de ${session.totalQuestions} preguntas. Ábrela en /practica o revisa el historial en /evaluaciones?session=${session.id}.`,
        intent: "exam_question",
        sources: [],
        suggestedFollowUps: ["Practicar ahora", "Explícame el tema antes", "Ver mi progreso"],
        usage: { model: "assessment-engine", inputTokens: 0, outputTokens: 0, estimatedCost: 0 },
      });
    }
    const result = await generateTutorResponse({
      profile,
      conversationId: parsed.data.conversationId,
      message: parsed.data.message,
      mode: parsed.data.mode,
      options: {
        unitNumber: parsed.data.unitNumber,
        debug: parsed.data.debug,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error && error.message === "RATE_LIMIT"
      ? "Espera un minuto antes de enviar más preguntas."
      : "No pude completar la consulta en este momento. Intenta nuevamente.";
    return NextResponse.json({ error: message }, { status: error instanceof Error && error.message === "RATE_LIMIT" ? 429 : 500 });
  }
}


function isAssessmentRequest(message: string) {
  return /hazme\s+\d*\s*preguntas|eval[uú]ame|quiero\s+practicar\s+preguntas|pr[áa]ctica\s+formativa/i.test(message);
}

function countFromMessage(message: string) {
  const numeric = message.match(/(5|10|15|20)/);
  if (numeric) return Number(numeric[1]);
  if (/cinco/i.test(message)) return 5;
  if (/diez/i.test(message)) return 10;
  return 5;
}

function questionTypeFromMessage(message: string) {
  if (/opci[oó]n|alternativa/i.test(message)) return "multiple_choice" as const;
  if (/verdadero|falso/i.test(message)) return "true_false" as const;
  if (/caso|aplicaci[oó]n/i.test(message)) return "case_application" as const;
  if (/abierta|desarroll/i.test(message)) return "open_answer" as const;
  if (/corta|breve/i.test(message)) return "short_answer" as const;
  return "mixed" as const;
}

function difficultyFromMessage(message: string) {
  if (/avanzad/i.test(message)) return "advanced" as const;
  if (/intermedi/i.test(message)) return "intermediate" as const;
  return "basic" as const;
}
