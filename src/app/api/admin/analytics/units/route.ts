import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminLearningAnalytics } from "@/lib/analytics/learning-analytics";
import { parseAnalyticsFilters, secureJsonError } from "@/lib/security/request-guards";

export async function GET(request: NextRequest) {
  await requireAdmin();
  try {
    const analytics = await getAdminLearningAnalytics(parseAnalyticsFilters(request.nextUrl.searchParams));
    return NextResponse.json({ units: analytics.units, reinforcement: analytics.reinforcement });
  } catch (error) {
    return secureJsonError(error);
  }
}
