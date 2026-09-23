import { NextRequest, NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { getStudentAnalytics } from "@/lib/analytics/learning-analytics";
import { parseAnalyticsFilters, secureJsonError } from "@/lib/security/request-guards";

export async function GET(request: NextRequest) {
  const profile = await requireStudent();
  try {
    if (!(await consumeLimit(`student-analytics:${profile.id}`, 60, 60))) {
      return NextResponse.json({ error: "Demasiadas consultas de analítica." }, { status: 429 });
    }
    return NextResponse.json(await getStudentAnalytics(profile.id, parseAnalyticsFilters(request.nextUrl.searchParams)));
  } catch (error) {
    return secureJsonError(error);
  }
}
