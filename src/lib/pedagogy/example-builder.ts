import type { KnowledgeChunkCandidate } from "@/lib/knowledge/types";

export function buildExampleInstruction(input: {
  query: string;
  sources: KnowledgeChunkCandidate[];
}) {
  const mainSource = input.sources[0];
  const topic =
    mainSource?.topicName ||
    mainSource?.sectionName ||
    mainSource?.title ||
    "el concepto recuperado";
  return [
    "Si corresponde incluir ejemplo, rotula claramente: Ejemplo didáctico.",
    `El ejemplo debe ilustrar especificamente ${topic}, no un tema generico.`,
    "Usa un escenario concreto: lugar o contexto, actores, problema, accion o decision, y cierre pedagogico.",
    "No presentes el ejemplo como cita, norma, hecho real, procedimiento oficial ni disposicion institucional si no aparece literalmente en la fuente.",
  ].join("\n");
}
