import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { generateTutorResponse } from "@/lib/tutor/tutor-service";

const chatSchema = z.object({
  conversationId: z.uuid().optional().nullable(),
  message: z.string().trim().min(3).max(1200),
  mode: z.enum(["normal", "quick", "explain", "example", "review"]).default("normal"),
  unitNumber: z.number().int().min(1).max(15).optional(),
  debug: z.boolean().optional(),
});

export async function POST(request: Request) {
  const profile = await requireStudent();
  const parsed = chatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Escribe una pregunta concreta para el tutor." },
      { status: 400 },
    );
  }
  try {
    const result = await generateTutorResponse({
      profile,
      conversationId: parsed.data.conversationId,
      message: parsed.data.message,
      mode: parsed.data.mode,
      options: {
        unitNumber: parsed.data.unitNumber,
        debug: parsed.data.debug,
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error && error.message === "RATE_LIMIT"
      ? "Espera un minuto antes de enviar más preguntas."
      : "No pude completar la consulta en este momento. Intenta nuevamente.";
    return NextResponse.json({ error: message }, { status: error instanceof Error && error.message === "RATE_LIMIT" ? 429 : 500 });
  }
}
