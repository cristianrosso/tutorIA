import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { KnowledgeChunkCandidate } from "@/lib/knowledge/types";

type ExpansionOptions = {
  maxParentExpansion?: number;
  maxRelationshipDepth?: number;
};

type ExpandedChunkRow = {
  id: string;
  knowledge_object_id: string | null;
  parent_id: string | null;
  academic_unit_id: string | null;
  academic_topic_id: string | null;
  content: string | null;
  source_content: string | null;
  source_text: string | null;
  source_reference: string | null;
  page_reference: string | null;
  keywords: string[] | null;
  metadata: Record<string, unknown> | null;
  knowledge_objects?: {
    id: string;
    title: string | null;
    concept: string | null;
    parent_id: string | null;
    hierarchy: Record<string, unknown> | null;
    source_content: string | null;
  } | null;
};

function candidateFromRow(
  row: ExpandedChunkRow,
  source: "parent" | "relation",
  relationType?: string,
): KnowledgeChunkCandidate {
  const hierarchy = row.knowledge_objects?.hierarchy || row.metadata || {};
  const text = row.source_text || row.source_content || row.knowledge_objects?.source_content || row.content || "";
  return {
    chunkId: row.id,
    knowledgeObjectId: row.knowledge_object_id,
    parentId: row.parent_id || row.knowledge_objects?.parent_id || null,
    unitId: row.academic_unit_id,
    unitNumber: Number(hierarchy.unit_number || row.metadata?.unit_number || 0) || null,
    unitName: String(hierarchy.unit_name || row.metadata?.unit_name || "") || null,
    topicId: row.academic_topic_id,
    topicName: String(hierarchy.topic_name || row.metadata?.topic_name || "") || null,
    sectionName: String(hierarchy.section_name || row.metadata?.section_name || "") || null,
    title: row.knowledge_objects?.title || row.knowledge_objects?.concept || null,
    content: row.content || text,
    sourceText: text,
    sourceReference: row.source_reference || "Compendio FATESCIPOL",
    pageReference: row.page_reference || null,
    keywords: row.keywords || [],
    semanticScore: 0,
    lexicalScore: 0,
    academicScore: 0.3,
    finalScore: source === "parent" ? 0.38 : 0.34,
    relationDepth: source === "relation" ? 1 : 0,
    relationType,
    source,
  };
}

async function fetchChunksForObjects(objectIds: string[], source: "parent" | "relation", relationType?: string) {
  if (!objectIds.length) return [];
  const { data, error } = await createSupabaseAdmin()
    .from("knowledge_chunks")
    .select(
      "id,knowledge_object_id,parent_id,academic_unit_id,academic_topic_id,chunk_type,content,source_content,source_text,source_reference,page_reference,keywords,metadata,knowledge_objects(id,title,concept,parent_id,hierarchy,source_content)",
    )
    .in("knowledge_object_id", [...new Set(objectIds)])
    .limit(30);
  if (error || !data) return [];
  return (data as unknown as ExpandedChunkRow[]).map((row) =>
    candidateFromRow(row, source, relationType),
  );
}

export async function expandParentChild(
  candidates: KnowledgeChunkCandidate[],
  options: ExpansionOptions = {},
) {
  const limit = options.maxParentExpansion ?? 4;
  const parentIds = candidates
    .map((candidate) => candidate.parentId)
    .filter((id): id is string => Boolean(id))
    .slice(0, limit);
  return fetchChunksForObjects(parentIds, "parent");
}

export async function expandRelations(
  candidates: KnowledgeChunkCandidate[],
  options: ExpansionOptions = {},
) {
  if ((options.maxRelationshipDepth ?? 1) < 1) return [];
  const objectIds = candidates
    .map((candidate) => candidate.knowledgeObjectId)
    .filter((id): id is string => Boolean(id))
    .slice(0, 8);
  if (!objectIds.length) return [];
  const { data, error } = await createSupabaseAdmin()
    .from("knowledge_relations")
    .select("from_object_id,to_object_id,relation_type,confidence")
    .in("from_object_id", objectIds)
    .in("relation_type", [
      "PARENT_OF",
      "CHILD_OF",
      "RELATED_TO",
      "PART_OF",
      "HAS_PRINCIPLE",
      "HAS_VALUE",
      "HAS_CHARACTERISTIC",
      "HAS_STEP",
      "SOURCE_OF",
    ])
    .gte("confidence", 0.55)
    .limit(12);
  if (error || !data?.length) return [];
  const rows = data as Array<{ to_object_id: string; relation_type: string }>;
  const chunks = await fetchChunksForObjects(
    rows.map((row) => row.to_object_id),
    "relation",
  );
  const relationByTarget = new Map(rows.map((row) => [row.to_object_id, row.relation_type]));
  return chunks.map((chunk) => ({
    ...chunk,
    relationType: relationByTarget.get(chunk.knowledgeObjectId || "") || chunk.relationType,
  }));
}
