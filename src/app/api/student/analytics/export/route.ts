import { NextRequest, NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { getStudentAnalyticsCsv, type AnalyticsPeriod } from "@/lib/analytics/learning-analytics";

export async function GET(request: NextRequest) {
  const profile = await requireStudent();
  const csv = await getStudentAnalyticsCsv(profile.id, { period: (request.nextUrl.searchParams.get("period") || "40d") as AnalyticsPeriod });
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=analitica-estudiante.csv",
    },
  });
}
