import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { getAdminLearningAnalytics } from "@/lib/analytics/learning-analytics";
import { parseAnalyticsFilters, secureJsonError } from "@/lib/security/request-guards";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  try {
    if (!(await consumeLimit(`admin-analytics:${admin.id}`, 120, 60))) {
      return NextResponse.json({ error: "Demasiadas consultas administrativas." }, { status: 429 });
    }
    return NextResponse.json(await getAdminLearningAnalytics(parseAnalyticsFilters(request.nextUrl.searchParams)));
  } catch (error) {
    return secureJsonError(error);
  }
}
