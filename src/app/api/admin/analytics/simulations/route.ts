import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminLearningAnalytics, type AnalyticsPeriod } from "@/lib/analytics/learning-analytics";

export async function GET(request: NextRequest) {
  await requireAdmin();
  const analytics = await getAdminLearningAnalytics({ period: (request.nextUrl.searchParams.get("period") || "40d") as AnalyticsPeriod });
  return NextResponse.json({ simulations: analytics.summary.simulationsCompleted, accuracy: analytics.summary.simulationAccuracy, trend: analytics.simulationTrend });
}
