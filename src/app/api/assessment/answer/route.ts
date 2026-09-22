import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { gradeAssessmentAnswer } from "@/lib/assessment/grading-service";
import { getAssessmentSession } from "@/lib/assessment/session-service";

const schema = z.object({
  sessionId: z.uuid(),
  questionId: z.uuid(),
  answer: z.union([z.string().trim().min(1).max(3000), z.boolean()]),
});

export async function POST(request: Request) {
  const profile = await requireStudent();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Envía una respuesta válida." }, { status: 400 });
  if (!(await consumeLimit(`assessment-answer:${profile.id}`, 20, 60))) {
    return NextResponse.json({ error: "Espera un minuto antes de enviar más respuestas." }, { status: 429 });
  }
  try {
    const result = await gradeAssessmentAnswer({ profile, ...parsed.data });
    const session = await getAssessmentSession(profile, parsed.data.sessionId);
    return NextResponse.json({ ...result, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo corregir la respuesta.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
