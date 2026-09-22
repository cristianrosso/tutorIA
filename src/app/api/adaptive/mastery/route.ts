import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { estimateStudentMastery } from "@/lib/adaptive/recommendation-engine";

export async function GET() {
  const profile = await requireStudent();
  const mastery = await estimateStudentMastery(profile.id);
  return NextResponse.json({ mastery });
}
