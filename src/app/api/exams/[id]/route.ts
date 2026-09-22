import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { getExamSession } from "@/lib/exams/exam-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const profile = await requireStudent();
    const { id } = await context.params;
    const session = await getExamSession(profile, id, { includeFeedback: false });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cargar el simulacro." }, { status: 400 });
  }
}
