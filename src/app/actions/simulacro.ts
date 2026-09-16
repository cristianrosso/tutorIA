"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireStudent } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/auth/rate-limit";
import {
  practiceSimulationErrors,
  startOralSimulation,
  submitOralAnswer,
  type SimulationState,
} from "@/lib/simulations/oral-exam";

export type SimulationActionState = {
  error?: string;
  simulation?: SimulationState;
  practiceQuestion?: string;
};

const startSchema = z.object({
  difficulty: z
    .enum(["basico", "intermedio", "avanzado"])
    .default("intermedio"),
  length: z.enum(["rapido", "completo"]).default("rapido"),
  unitNumber: z.coerce.number().int().min(1).max(15).default(1),
});

const answerSchema = z.object({
  simulationId: z.string().uuid(),
  answer: z.string().trim().min(3).max(2500),
});

const practiceSchema = z.object({
  simulationId: z.string().uuid(),
});

export async function startSimulation(
  _previous: SimulationActionState,
  form: FormData,
): Promise<SimulationActionState> {
  const profile = await requireStudent();
  const parsed = startSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Configuración de simulacro inválida." };
  try {
    if (!(await consumeLimit(`simulation-start:${profile.id}`, 4, 60)))
      return { error: "Espera un momento antes de iniciar otro simulacro." };
    const simulation = await startOralSimulation(profile, parsed.data);
    revalidatePath("/simulacro");
    return { simulation };
  } catch {
    return {
      error:
        "No se pudo iniciar el simulacro. Verifica que la unidad seleccionada tenga contenido cargado.",
    };
  }
}

export async function submitSimulationAnswer(
  _previous: SimulationActionState,
  form: FormData,
): Promise<SimulationActionState> {
  const profile = await requireStudent();
  const parsed = answerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Responde con una explicación un poco más completa." };
  try {
    if (!(await consumeLimit(`simulation-answer:${profile.id}`, 8, 60)))
      return { error: "Espera un minuto antes de enviar más respuestas." };
    const simulation = await submitOralAnswer({
      profile,
      simulationId: parsed.data.simulationId,
      answer: parsed.data.answer,
    });
    revalidatePath("/simulacro");
    return { simulation };
  } catch {
    return {
      error:
        "No se pudo evaluar tu respuesta. Intenta nuevamente sin cerrar el simulacro.",
    };
  }
}

export async function practiceErrors(
  _previous: SimulationActionState,
  form: FormData,
): Promise<SimulationActionState> {
  const profile = await requireStudent();
  const parsed = practiceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "No se encontró el simulacro." };
  try {
    const question = await practiceSimulationErrors({
      profile,
      simulationId: parsed.data.simulationId,
    });
    return { practiceQuestion: question.question };
  } catch {
    return { error: "No se pudo preparar la práctica de errores." };
  }
}
