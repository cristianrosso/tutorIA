import type { PedagogicalStrategy, StrategyInput } from "@/lib/pedagogy/types";

export function selectPedagogicalStrategy(
  input: StrategyInput,
): PedagogicalStrategy {
  if (input.reformulationRequested) return "PROGRESSIVE_EXPLANATION";
  if (input.mode === "quick") return "DIRECT_EXPLANATION";
  if (input.mode === "simple") return "PROGRESSIVE_EXPLANATION";
  if (input.mode === "academic") return "CONCEPTUAL_BREAKDOWN";
  if (input.mode === "deep") return "CONCEPTUAL_BREAKDOWN";
  if (input.mode === "example" || input.queryIntent === "example")
    return "PRACTICAL_EXAMPLE";
  if (input.mode === "review" || input.queryIntent === "exam_question")
    return "GUIDED_REVIEW";
  if (input.mode === "comparison" || input.queryIntent === "comparison")
    return "COMPARATIVE_EXPLANATION";
  if (input.mode === "step_by_step" || input.queryIntent === "procedure")
    return "PROCEDURAL_EXPLANATION";
  if (/preg[uú]ntame|comprueba|evalu[aá]me/i.test(input.query))
    return "ACTIVE_RECALL";
  if (
    input.availableSources.some((source) =>
      /procedimiento|paso|fase|etapa/i.test(
        source.title ||
          source.topicName ||
          source.sectionName ||
          source.content,
      ),
    )
  ) {
    return "PROCEDURAL_EXPLANATION";
  }
  return "PROGRESSIVE_EXPLANATION";
}

export function strategyInstruction(strategy: PedagogicalStrategy) {
  const instructions: Record<PedagogicalStrategy, string> = {
    DIRECT_EXPLANATION:
      "Da una respuesta breve y precisa. Evita desarrollar apartados no solicitados.",
    PROGRESSIVE_EXPLANATION:
      "Explica de lo simple a lo academico: idea base, aclaracion sencilla y cierre verificable.",
    CONCEPTUAL_BREAKDOWN:
      "Descompone el tema en elementos, relaciones y aplicacion. No agregues elementos sin fuente.",
    PRACTICAL_EXAMPLE:
      "Incluye un ejemplo didactico contextualizado y explica que parte del concepto ilustra.",
    COMPARATIVE_EXPLANATION:
      "Compara conceptos solo con datos respaldados. Si falta informacion de un lado, dilo.",
    PROCEDURAL_EXPLANATION:
      "Ordena pasos o fases respetando la secuencia del compendio cuando exista.",
    ACTIVE_RECALL:
      "Formula una pregunta breve de comprobacion y ofrece una pista opcional.",
    GUIDED_REVIEW:
      "Organiza lo esencial para examen: concepto, elementos que debe recordar, aplicacion y pregunta de comprobacion.",
  };
  return instructions[strategy];
}
