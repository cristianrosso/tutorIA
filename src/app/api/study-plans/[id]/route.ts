import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import {
  getStudyPlan,
  updateStudyPlan,
} from "@/lib/study-plan/study-plan-service";
import { updatePlanSchema } from "@/lib/study-plan/types";

const paramsSchema = z.object({ id: z.uuid() });

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const profile = await requireStudent();
  const params = paramsSchema.parse(await context.params);
  const plan = await getStudyPlan(profile.id, params.id);
  return NextResponse.json(plan);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const profile = await requireStudent();
  const params = paramsSchema.parse(await context.params);
  const parsed = updatePlanSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Actualización inválida." },
      { status: 400 },
    );
  try {
    const plan = await updateStudyPlan(profile.id, params.id, parsed.data);
    return NextResponse.json(plan);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el plan.",
      },
      { status: 400 },
    );
  }
}
