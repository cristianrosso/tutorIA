import "server-only";
import { generateEmbedding } from "@/lib/ai/embeddings";
import { analyzeQuery } from "@/lib/knowledge/query-analyzer";
import { hybridSearch } from "@/lib/knowledge/hybrid-search";
import { rerankCandidates } from "@/lib/knowledge/reranker";
import { buildAcademicContext } from "@/lib/knowledge/context-builder";
import { expandParentChild, expandRelations } from "@/lib/knowledge/expansion";
import type { AcademicContextResult, HybridSearchOptions } from "@/lib/knowledge/types";

export type RetrieveAcademicContextOptions = HybridSearchOptions & {
  maxContextTokens?: number;
  maxParentExpansion?: number;
  maxRelationshipDepth?: number;
  skipEmbedding?: boolean;
};

export async function retrieveAcademicContext(
  query: string,
  options: RetrieveAcademicContextOptions = {},
): Promise<AcademicContextResult> {
  const totalStarted = Date.now();
  const analysis = analyzeQuery(query);
  const debug = process.env.RAG_DEBUG === "true" || options.debug;
  const embeddingStarted = Date.now();
  let embedding: number[] | null = null;
  let embeddingDebug: unknown = null;
  if (!options.skipEmbedding) {
    try {
      const result = await generateEmbedding(query);
      embedding = result.embedding;
      embeddingDebug = debug
        ? { model: result.model, dimensions: result.embedding.length, contentHash: result.contentHash }
        : undefined;
    } catch (error) {
      embeddingDebug = { error: error instanceof Error ? error.message : "embedding_failed" };
    }
  }
  const embeddingMs = Date.now() - embeddingStarted;

  const searchStarted = Date.now();
  const searched = await hybridSearch(analysis, embedding, options);
  const searchMs = Date.now() - searchStarted;

  const rerankStarted = Date.now();
  const ranked = rerankCandidates(query, searched.candidates, analysis).slice(
    0,
    options.maxChunks || 10,
  );
  const parents = await expandParentChild(ranked, options);
  const relations = await expandRelations(ranked, options);
  const expanded = rerankCandidates(query, [...ranked, ...parents, ...relations], analysis);
  const { context, sources } = buildAcademicContext(analysis, expanded, {
    maxChunks: options.maxChunks || 8,
    maxContextTokens: options.maxContextTokens,
  });
  const rerankMs = Date.now() - rerankStarted;

  return {
    queryAnalysis: analysis,
    sources,
    context,
    diagnostics: {
      embeddingMs,
      searchMs,
      rerankMs,
      totalMs: Date.now() - totalStarted,
      debug: debug
        ? {
            embedding: embeddingDebug,
            search: searched.debug,
            selected: sources.map((source) => ({
              chunkId: source.chunkId,
              semanticScore: source.semanticScore,
              lexicalScore: source.lexicalScore,
              academicScore: source.academicScore,
              finalScore: source.finalScore,
              source: source.source,
              relationType: source.relationType,
            })),
          }
        : undefined,
    },
  };
}
