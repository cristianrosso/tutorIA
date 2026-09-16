"use server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/auth/rate-limit";
import {
  answerQuestion,
  detectTutorIntent,
  type TutorIntent,
} from "@/lib/rag/tutor";

export type TutorActionState = {
  error?: string;
  answer?: string;
  question?: string;
  unitNumber?: number;
  section?: string;
  sources?: Array<{
    title: string;
    source: string;
    unitName?: string;
    section: string | null;
    sectionName: string | null;
    page: number | null;
    score: number;
  }>;
};

const questionSchema = z.object({
  question: z.string().trim().min(3).max(1000),
  unitNumber: z.coerce.number().int().min(1).max(15).default(1),
  section: z.string().trim().max(180).optional(),
  intent: z
    .enum([
      "normal",
      "facil",
      "ejemplo",
      "otro_ejemplo",
      "examen",
      "pregunta",
      "no_entendi",
    ])
    .optional(),
});

export async function askTutor(
  _previous: TutorActionState,
  form: FormData,
): Promise<TutorActionState> {
  const profile = await requireStudent();
  const parsed = questionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Escribe una pregunta concreta para el tutor." };
  try {
    if (!(await consumeLimit(`tutor:${profile.id}`, 12, 60)))
      return { error: "Espera un minuto antes de enviar más preguntas." };
    const intent =
      parsed.data.intent || detectTutorIntent(parsed.data.question);
    const result = await answerQuestion({
      profile,
      question: parsed.data.question,
      unitNumber: parsed.data.unitNumber,
      section: parsed.data.section,
      intent: intent as TutorIntent,
    });
    return {
      question: parsed.data.question,
      unitNumber: parsed.data.unitNumber,
      section: parsed.data.section,
      answer: result.answer,
      sources: result.sources.map((source) => ({
        title: source.title,
        source: source.source,
        unitName: source.unitName,
        section: source.section,
        sectionName: source.sectionName,
        page: source.page,
        score: source.score,
      })),
    };
  } catch {
    return {
      error:
        "No se pudo generar la respuesta. Verifica la clave de OpenAI y vuelve a intentar.",
    };
  }
}
