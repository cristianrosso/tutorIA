import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { getExamHistory } from "@/lib/exams/exam-service";

export async function GET() {
  try {
    const profile = await requireStudent();
    const history = await getExamHistory(profile);
    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar el historial." }, { status: 400 });
  }
}
