import { NextRequest, NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { getStudentAnalytics } from "@/lib/analytics/learning-analytics";
import { parseAnalyticsFilters, secureJsonError } from "@/lib/security/request-guards";

export async function GET(request: NextRequest) {
  const profile = await requireStudent();
  try {
    const analytics = await getStudentAnalytics(profile.id, parseAnalyticsFilters(request.nextUrl.searchParams));
    return NextResponse.json({ reinforcement: analytics.reinforcement, limitations: analytics.limitations });
  } catch (error) {
    return secureJsonError(error);
  }
}
