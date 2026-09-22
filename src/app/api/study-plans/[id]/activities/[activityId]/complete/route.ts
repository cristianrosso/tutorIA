import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { completeStudyActivity } from "@/lib/study-plan/study-plan-service";

const paramsSchema = z.object({ id: z.uuid(), activityId: z.uuid() });
const bodySchema = z
  .object({ actualMinutes: z.number().int().min(0).max(720).optional() })
  .default({});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; activityId: string }> },
) {
  const profile = await requireStudent();
  const params = paramsSchema.parse(await context.params);
  const body = bodySchema.parse(await request.json().catch(() => ({})));
  try {
    const plan = await completeStudyActivity(
      profile.id,
      params.id,
      params.activityId,
      body.actualMinutes,
    );
    return NextResponse.json(plan);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo completar la actividad.",
      },
      { status: 400 },
    );
  }
}
