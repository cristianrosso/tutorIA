import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { identifyLearningGaps } from "@/lib/adaptive/recommendation-engine";

export async function GET() {
  const profile = await requireStudent();
  const gaps = await identifyLearningGaps(profile.id);
  return NextResponse.json({ gaps });
}
