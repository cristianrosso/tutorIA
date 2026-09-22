import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { saveExamAnswer } from "@/lib/exams/exam-service";

const bodySchema = z.object({
  sessionQuestionId: z.uuid(),
  answer: z.union([z.string().trim().max(6000), z.boolean()]),
  inputMode: z.enum(["text", "voice"]).optional(),
  transcriptRaw: z.string().trim().max(6000).optional().nullable(),
  transcriptEdited: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await requireStudent();
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const session = await saveExamAnswer(profile, {
      examId: id,
      sessionQuestionId: body.sessionQuestionId,
      answer: body.answer,
      inputMode: body.inputMode,
      transcriptRaw: body.transcriptRaw,
      transcriptEdited: body.transcriptEdited,
    });
    return NextResponse.json({ session });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo guardar la respuesta.",
      },
      { status: 400 },
    );
  }
}
