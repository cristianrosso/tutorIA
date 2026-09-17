import type { KnowledgeObject } from "@/lib/mkf1/schema";

export type AcademicIntent =
  | "definition"
  | "explanation"
  | "comparison"
  | "procedure"
  | "enumeration"
  | "example"
  | "exam_question"
  | "general_question";

export type QueryAnalysis = {
  query: string;
  normalizedQuery: string;
  intent: AcademicIntent;
  probableUnitNumber: number | null;
  topicHint: string | null;
  entities: string[];
  responseType: AcademicIntent;
};

export type KnowledgeChunkCandidate = {
  chunkId: string;
  knowledgeObjectId: string | null;
  parentId: string | null;
  unitId: string | null;
  unitNumber: number | null;
  unitName: string | null;
  topicId: string | null;
  topicName: string | null;
  sectionName: string | null;
  title: string | null;
  content: string;
  sourceText: string;
  sourceReference: string | null;
  pageReference: string | null;
  keywords: string[];
  semanticScore: number;
  lexicalScore: number;
  academicScore: number;
  finalScore: number;
  relationDepth?: number;
  relationType?: string;
  source: "semantic" | "lexical" | "parent" | "relation" | "fallback";
};

export type HybridSearchOptions = {
  unitNumber?: number | null;
  topicId?: string | null;
  matchThreshold?: number;
  matchCount?: number;
  maxChunks?: number;
  semanticWeight?: number;
  lexicalWeight?: number;
  academicWeight?: number;
  debug?: boolean;
};

export type AcademicContextResult = {
  queryAnalysis: QueryAnalysis;
  sources: KnowledgeChunkCandidate[];
  context: string;
  diagnostics: {
    embeddingMs: number;
    searchMs: number;
    rerankMs: number;
    totalMs: number;
    debug?: unknown;
  };
};

export type KnowledgeObjectLike = Pick<
  KnowledgeObject,
  "knowledge_id" | "hierarchy" | "knowledge" | "retrieval" | "provenance"
>;
