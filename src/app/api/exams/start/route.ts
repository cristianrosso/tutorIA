import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { startExam } from "@/lib/exams/exam-service";

const bodySchema = z.object({ examId: z.uuid() });

export async function POST(request: Request) {
  try {
    const profile = await requireStudent();
    const body = bodySchema.parse(await request.json());
    const session = await startExam(profile, body.examId);
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo iniciar el simulacro." }, { status: 400 });
  }
}
