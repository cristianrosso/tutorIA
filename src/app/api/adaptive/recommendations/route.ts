import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { generateLearningRecommendations } from "@/lib/adaptive/recommendation-engine";

export async function GET() {
  const profile = await requireStudent();
  const recommendations = await generateLearningRecommendations({ userId: profile.id, limit: 5 });
  return NextResponse.json({ recommendations });
}
