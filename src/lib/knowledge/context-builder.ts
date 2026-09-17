import type { KnowledgeChunkCandidate, QueryAnalysis } from "@/lib/knowledge/types";

export type BuildContextOptions = {
  maxChunks?: number;
  maxContextTokens?: number;
};

function estimateTokens(text: string) {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.35);
}

export function buildAcademicContext(
  analysis: QueryAnalysis,
  candidates: KnowledgeChunkCandidate[],
  options: BuildContextOptions = {},
) {
  const maxChunks = options.maxChunks || 8;
  const maxTokens = options.maxContextTokens || 2200;
  const unique: KnowledgeChunkCandidate[] = [];
  const seenContent = new Set<string>();
  let tokens = 0;
  for (const candidate of candidates) {
    const key = candidate.sourceText.replace(/\s+/g, " ").trim().slice(0, 240);
    if (seenContent.has(key)) continue;
    const nextTokens = estimateTokens(candidate.sourceText);
    if (unique.length >= maxChunks || tokens + nextTokens > maxTokens) break;
    seenContent.add(key);
    unique.push(candidate);
    tokens += nextTokens;
  }
  const context = `<academic_context>\nConsulta: ${analysis.query}\nIntencion: ${analysis.intent}\n\n${unique
    .map(
      (source, index) => `[SOURCE ${index + 1}]\nUnidad: ${source.unitNumber || "?"} - ${source.unitName || "Sin unidad"}\nTema: ${source.topicName || "Sin tema"}\nSubtema: ${source.sectionName || source.title || "Sin subtitulo"}\nFuente: ${source.sourceReference || "Compendio FATESCIPOL"}${source.pageReference ? `, ${source.pageReference}` : ""}\nKnowledge Object: ${source.knowledgeObjectId || "sin-id"}\nScore: ${source.finalScore.toFixed(3)}\n\nContenido oficial:\n${source.sourceText || source.content}`,
    )
    .join("\n\n")}\n</academic_context>`;
  return { context, sources: unique };
}
