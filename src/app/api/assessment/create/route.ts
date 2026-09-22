import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { createAssessmentSession } from "@/lib/assessment/question-generator";
import { getAssessmentSession } from "@/lib/assessment/session-service";
import { assessmentDifficulties, assessmentQuestionTypes } from "@/lib/assessment/types";

const schema = z.object({
  unitNumber: z.coerce.number().int().min(1).max(15),
  topicId: z.uuid().optional().nullable(),
  topicName: z.string().trim().max(180).optional().nullable(),
  questionType: z.union([z.enum(assessmentQuestionTypes), z.literal("mixed")]).default("mixed"),
  difficulty: z.enum(assessmentDifficulties).default("basic"),
  count: z.coerce.number().int().min(1).max(20).default(5),
});

export async function POST(request: Request) {
  const profile = await requireStudent();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Configura una evaluación válida." }, { status: 400 });
  if (!(await consumeLimit(`assessment-create:${profile.id}`, 6, 60))) {
    return NextResponse.json({ error: "Espera un momento antes de generar otra evaluación." }, { status: 429 });
  }
  try {
    const sessionId = await createAssessmentSession({ profile, ...parsed.data });
    const session = await getAssessmentSession(profile, sessionId);
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear la evaluación.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
