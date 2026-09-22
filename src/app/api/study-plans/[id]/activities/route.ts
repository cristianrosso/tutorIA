import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { getStudyPlan } from "@/lib/study-plan/study-plan-service";

const paramsSchema = z.object({ id: z.uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const profile = await requireStudent();
  const params = paramsSchema.parse(await context.params);
  const plan = await getStudyPlan(profile.id, params.id);
  return NextResponse.json({
    activities: plan.activities,
    summary: plan.summary,
  });
}
