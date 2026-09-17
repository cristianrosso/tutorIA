import { tokenize } from "@/lib/rag/chunk";
import type { KnowledgeChunkCandidate, QueryAnalysis } from "@/lib/knowledge/types";

function overlapScore(query: string, candidate: KnowledgeChunkCandidate) {
  const queryTokens = new Set(tokenize(query));
  if (!queryTokens.size) return 0;
  const textTokens = new Set(
    tokenize(
      `${candidate.title || ""} ${candidate.topicName || ""} ${candidate.sectionName || ""} ${candidate.keywords.join(" ")} ${candidate.content}`,
    ),
  );
  let overlap = 0;
  for (const token of queryTokens) if (textTokens.has(token)) overlap += 1;
  return overlap / queryTokens.size;
}

export function rerankCandidates(
  query: string,
  candidates: KnowledgeChunkCandidate[],
  analysis?: QueryAnalysis,
) {
  const seen = new Map<string, KnowledgeChunkCandidate>();
  for (const candidate of candidates) {
    const existing = seen.get(candidate.chunkId);
    if (!existing || candidate.finalScore > existing.finalScore)
      seen.set(candidate.chunkId, candidate);
  }
  return [...seen.values()]
    .map((candidate) => {
      const keywordOverlap = overlapScore(query, candidate);
      const titleMatch = candidate.title
        ? overlapScore(query, { ...candidate, content: candidate.title })
        : 0;
      const intentBoost =
        analysis?.intent === "enumeration" && /princip|caracter|tipo|valor/i.test(candidate.title || candidate.content)
          ? 0.08
          : analysis?.intent === "procedure" && /proced|paso|primero|segundo/i.test(candidate.content)
            ? 0.08
            : analysis?.intent === "definition" && /define|concepto|se entiende|es /i.test(candidate.content)
              ? 0.08
              : 0;
      return {
        ...candidate,
        finalScore: candidate.finalScore + keywordOverlap * 0.12 + titleMatch * 0.08 + intentBoost,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore);
}
