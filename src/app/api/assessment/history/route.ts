import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { getAssessmentHistory } from "@/lib/assessment/session-service";

export async function GET() {
  const profile = await requireStudent();
  const history = await getAssessmentHistory(profile, 50);
  return NextResponse.json({ history });
}
