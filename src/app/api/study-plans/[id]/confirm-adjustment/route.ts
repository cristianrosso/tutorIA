import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { applyStudyPlanAdjustment } from "@/lib/study-plan/study-plan-service";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .default("Reprogramación confirmada"),
  })
  .default({ reason: "Reprogramación confirmada" });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const profile = await requireStudent();
  const params = paramsSchema.parse(await context.params);
  const body = bodySchema.parse(await request.json().catch(() => ({})));
  try {
    const plan = await applyStudyPlanAdjustment(
      profile.id,
      params.id,
      body.reason,
    );
    return NextResponse.json(plan);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo aplicar la reprogramación.",
      },
      { status: 400 },
    );
  }
}
