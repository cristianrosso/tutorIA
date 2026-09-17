import "server-only";
import type { KnowledgeChunkCandidate } from "@/lib/knowledge/types";

export function validateTutorResponse(input: {
  answer: string;
  sources: KnowledgeChunkCandidate[];
  context: string;
}) {
  const warnings: string[] = [];
  if (input.sources.length === 0) warnings.push("NO_SOURCES");
  if (input.context.trim().length < 160) warnings.push("LOW_CONTEXT");
  if (/prompt|instrucciones internas|api key|supabase_secret/i.test(input.answer)) {
    warnings.push("SENSITIVE_DISCLOSURE_RISK");
  }
  return {
    ok: warnings.length === 0,
    warnings,
    shouldAbstain: warnings.includes("NO_SOURCES") || warnings.includes("LOW_CONTEXT"),
  };
}

export function insufficientContextAnswer() {
  return [
    "No encontré suficiente información sobre ese punto en el compendio disponible.",
    "Puedo ayudarte con los conceptos relacionados que sí aparecen en el material o puedes formular la pregunta de otra manera.",
  ].join("\n\n");
}
