import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { answerGuidedClassStep } from "@/lib/classroom/guided-class-service";

const schema = z.object({
  stepId: z.string().uuid(),
  answer: z.string().trim().min(2).max(1600),
  inputMode: z.enum(["text", "voice"]).default("text"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await requireStudent();
    const { id } = await params;
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: "Escribe una respuesta para la pregunta de comprobación." },
        { status: 400 },
      );
    const session = await answerGuidedClassStep(profile, id, parsed.data);
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo registrar la respuesta.",
      },
      { status: 500 },
    );
  }
}
