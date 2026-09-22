import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { createStudyPlanDraft } from "@/lib/study-plan/study-plan-service";

export async function POST(request: Request) {
  const profile = await requireStudent();
  try {
    const plan = await createStudyPlanDraft(
      profile.id,
      await request.json().catch(() => null),
    );
    return NextResponse.json(plan);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No se pudo crear el plan.",
      },
      { status: 400 },
    );
  }
}
