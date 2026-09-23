import { NextRequest } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { getStudentAnalyticsCsv } from "@/lib/analytics/learning-analytics";
import { parseAnalyticsFilters, secureJsonError } from "@/lib/security/request-guards";

export async function GET(request: NextRequest) {
  const profile = await requireStudent();
  try {
    if (!(await consumeLimit(`student-analytics-export:${profile.id}`, 6, 3600))) {
      return Response.json({ error: "Demasiadas exportaciones." }, { status: 429 });
    }
    const csv = await getStudentAnalyticsCsv(profile.id, parseAnalyticsFilters(request.nextUrl.searchParams));
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=analitica-estudiante.csv",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return secureJsonError(error);
  }
}
