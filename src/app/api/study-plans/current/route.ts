import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { getCurrentStudyPlan } from "@/lib/study-plan/study-plan-service";

export async function GET() {
  const profile = await requireStudent();
  const plan = await getCurrentStudyPlan(profile.id);
  return NextResponse.json({ plan });
}
