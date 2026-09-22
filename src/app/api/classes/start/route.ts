import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { startGuidedClass } from "@/lib/classroom/guided-class-service";

const schema = z.object({
  unitNumber: z.number().int().min(1).max(15),
  topicId: z.string().uuid().optional().nullable(),
  topicLabel: z.string().trim().max(180).optional().nullable(),
  classMode: z.enum(["topic", "unit", "reinforcement"]),
  pedagogicalMode: z.enum(["simple", "academic", "deep", "review"]),
  interactionMode: z.enum(["text", "voice", "mixed"]),
  estimatedDurationMinutes: z.union([
    z.literal(15),
    z.literal(30),
    z.literal(45),
    z.literal(60),
  ]),
});

export async function POST(request: Request) {
  try {
    const profile = await requireStudent();
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      return NextResponse.json(
        { error: "Configura la clase guiada." },
        { status: 400 },
      );
    const session = await startGuidedClass(profile, parsed.data);
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo iniciar la clase.",
      },
      { status: 500 },
    );
  }
}
