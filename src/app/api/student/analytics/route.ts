import { NextRequest, NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { getStudentAnalytics, type AnalyticsPeriod } from "@/lib/analytics/learning-analytics";

export async function GET(request: NextRequest) {
  const profile = await requireStudent();
  const period = (request.nextUrl.searchParams.get("period") || "40d") as AnalyticsPeriod;
  const analytics = await getStudentAnalytics(profile.id, { period });
  return NextResponse.json(analytics);
}
