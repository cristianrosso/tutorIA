import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { tokenize } from "@/lib/rag/chunk";
import type { HybridSearchOptions, KnowledgeChunkCandidate, QueryAnalysis } from "@/lib/knowledge/types";

type DbKnowledgeChunk = {
  id: string;
  knowledge_object_id: string | null;
  parent_id: string | null;
  academic_unit_id: string | null;
  academic_topic_id: string | null;
  chunk_type: string | null;
  content: string | null;
  source_content: string | null;
  source_text: string | null;
  source_reference: string | null;
  page_reference: string | null;
  keywords: string[] | null;
  metadata: Record<string, unknown> | null;
  knowledge_objects?:
    | {
        id: string;
        title: string | null;
        concept: string | null;
        parent_id: string | null;
        hierarchy: Record<string, unknown> | null;
        source_content: string | null;
      }
    | Array<{
        id: string;
        title: string | null;
        concept: string | null;
        parent_id: string | null;
        hierarchy: Record<string, unknown> | null;
        source_content: string | null;
      }>
    | null;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lexicalScore(query: string, text: string, keywords: string[]) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return 0;
  const haystack = tokenize(`${text} ${keywords.join(" ")}`);
  const haystackSet = new Set(haystack);
  const matches = queryTokens.reduce((sum, token) => {
    if (haystackSet.has(token)) return sum + 1;
    if (haystack.some((word) => word.includes(token) || token.includes(word)))
      return sum + 0.5;
    return sum;
  }, 0);
  return Math.min(1, matches / queryTokens.length);
}

function academicScore(
  analysis: QueryAnalysis,
  candidate: Omit<KnowledgeChunkCandidate, "academicScore" | "finalScore">,
  options: HybridSearchOptions,
) {
  let score = 0;
  if (options.unitNumber && candidate.unitNumber === options.unitNumber) score += 0.35;
  if (analysis.probableUnitNumber && candidate.unitNumber === analysis.probableUnitNumber)
    score += 0.25;
  const titleText = normalize(`${candidate.title || ""} ${candidate.topicName || ""} ${candidate.sectionName || ""}`);
  for (const entity of analysis.entities) if (titleText.includes(entity)) score += 0.08;
  const keywordText = normalize(candidate.keywords.join(" "));
  for (const entity of analysis.entities) if (keywordText.includes(entity)) score += 0.04;
  if (candidate.parentId) score += 0.04;
  return Math.min(1, score);
}

function rowToCandidate(
  row: DbKnowledgeChunk,
  analysis: QueryAnalysis,
  options: HybridSearchOptions,
  semanticScore: number,
  source: KnowledgeChunkCandidate["source"],
): KnowledgeChunkCandidate {
  const knowledgeObject = Array.isArray(row.knowledge_objects)
    ? row.knowledge_objects[0]
    : row.knowledge_objects;
  const hierarchy = knowledgeObject?.hierarchy || row.metadata || {};
  const unitNumber = Number(hierarchy.unit_number || row.metadata?.unit_number || 0) || null;
  const unitName = String(hierarchy.unit_name || row.metadata?.unit_name || "") || null;
  const topicName = String(hierarchy.topic_name || row.metadata?.topic_name || "") || null;
  const sectionName = String(hierarchy.section_name || row.metadata?.section_name || "") || null;
  const title = knowledgeObject?.title || knowledgeObject?.concept || sectionName || topicName;
  const sourceText = row.source_text || row.source_content || knowledgeObject?.source_content || row.content || "";
  const keywords = row.keywords || (Array.isArray(row.metadata?.keywords) ? (row.metadata?.keywords as string[]) : []);
  const base = {
    chunkId: row.id,
    knowledgeObjectId: row.knowledge_object_id,
    parentId: row.parent_id || knowledgeObject?.parent_id || null,
    unitId: row.academic_unit_id,
    unitNumber,
    unitName,
    topicId: row.academic_topic_id,
    topicName,
    sectionName,
    title,
    content: row.content || sourceText,
    sourceText,
    sourceReference: row.source_reference || "Compendio FATESCIPOL",
    pageReference: row.page_reference,
    keywords,
    semanticScore,
    lexicalScore: lexicalScore(analysis.query, `${title || ""} ${sourceText}`, keywords),
    source,
  } satisfies Omit<KnowledgeChunkCandidate, "academicScore" | "finalScore">;
  const aScore = academicScore(analysis, base, options);
  const semanticWeight = options.semanticWeight ?? 0.6;
  const lexicalWeight = options.lexicalWeight ?? 0.25;
  const academicWeight = options.academicWeight ?? 0.15;
  return {
    ...base,
    academicScore: aScore,
    finalScore:
      semanticWeight * semanticScore + lexicalWeight * base.lexicalScore + academicWeight * aScore,
  };
}

export async function hybridSearch(
  analysis: QueryAnalysis,
  embedding: number[] | null,
  options: HybridSearchOptions = {},
) {
  const db = createSupabaseAdmin();
  const candidates: KnowledgeChunkCandidate[] = [];
  const debug: Record<string, unknown> = { semantic: [], lexical: [] };

  if (embedding?.length) {
    const { data, error } = await db.rpc("match_knowledge_chunks", {
      query_embedding: embedding,
      match_threshold: options.matchThreshold ?? 0.15,
      match_count: options.matchCount ?? 20,
      filter_unit_number: options.unitNumber || analysis.probableUnitNumber || null,
      filter_topic_id: options.topicId || null,
    });
    if (!error && Array.isArray(data)) {
      debug.semantic = data;
      for (const item of data as Array<DbKnowledgeChunk & { similarity?: number }>) {
        candidates.push(rowToCandidate(item, analysis, options, Number(item.similarity || 0), "semantic"));
      }
    } else if (error) {
      debug.semanticError = error.message;
    }
  }

  let query = db
    .from("knowledge_chunks")
    .select(
      "id,knowledge_object_id,parent_id,academic_unit_id,academic_topic_id,chunk_type,content,source_content,source_text,source_reference,page_reference,keywords,metadata,knowledge_objects(id,title,concept,parent_id,hierarchy,source_content)",
    )
    .limit(1500);
  const unitFilter = options.unitNumber || analysis.probableUnitNumber;
  if (unitFilter) query = query.contains("metadata", { unit_number: unitFilter });
  const { data: lexicalRows, error: lexicalError } = await query;
  if (!lexicalError && lexicalRows) {
    for (const row of lexicalRows as unknown as DbKnowledgeChunk[]) {
      const candidate = rowToCandidate(row, analysis, options, 0, "lexical");
      if (candidate.lexicalScore > 0 || candidate.academicScore > 0.2)
        candidates.push(candidate);
    }
    debug.lexical = candidates.filter((item) => item.source === "lexical").slice(0, 20);
  } else if (lexicalError) {
    debug.lexicalError = lexicalError.message;
  }

  return { candidates, debug };
}
