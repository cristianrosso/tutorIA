import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { updateRecommendationStatus } from "@/lib/adaptive/recommendation-engine";

const paramsSchema = z.object({ id: z.uuid() });

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const profile = await requireStudent();
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return NextResponse.json({ error: "Recomendación no válida." }, { status: 400 });
  const recommendation = await updateRecommendationStatus(profile.id, parsed.data.id, "accepted");
  return NextResponse.json({ recommendation });
}
