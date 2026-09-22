import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { submitExam } from "@/lib/exams/exam-service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const profile = await requireStudent();
    const { id } = await context.params;
    const session = await submitExam(profile, id);
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo finalizar el simulacro." }, { status: 400 });
  }
}
