import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { getAssessmentSession } from "@/lib/assessment/session-service";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const profile = await requireStudent();
  const { id } = await context.params;
  try {
    const session = await getAssessmentSession(profile, id);
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se encontró la evaluación.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
