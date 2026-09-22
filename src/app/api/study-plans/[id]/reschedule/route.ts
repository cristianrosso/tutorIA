import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { proposeStudyPlanAdjustment } from "@/lib/study-plan/study-plan-service";

const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z
  .object({
    reason: z.string().trim().min(3).max(160).default("Actividad pendiente"),
  })
  .default({ reason: "Actividad pendiente" });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const profile = await requireStudent();
  const params = paramsSchema.parse(await context.params);
  const body = bodySchema.parse(await request.json().catch(() => ({})));
  try {
    const proposal = await proposeStudyPlanAdjustment(
      profile.id,
      params.id,
      body.reason,
    );
    return NextResponse.json({ proposal });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo proponer la reprogramación.",
      },
      { status: 400 },
    );
  }
}
