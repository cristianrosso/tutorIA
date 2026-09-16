import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { tokenize } from "@/lib/rag/chunk";

export type RetrievedSource = {
  chunkId: string;
  documentId: string;
  title: string;
  source: string;
  version: string;
  unitName: string;
  section: string | null;
  sectionName: string | null;
  page: number | null;
  content: string;
  score: number;
};

type DocumentRow = {
  id: string;
  title: string;
  source: string;
  version: string;
  unit_id: string;
};
type ChunkRow = {
  id: string;
  document_id: string;
  content: string;
  section: string | null;
  section_name: string | null;
  section_title?: string | null;
  topic: string | null;
  page: number | null;
};

export type RetrieveOptions = { section?: string | null; limit?: number };

function scoreChunk(
  chunk: ChunkRow,
  queryTokens: string[],
  sectionTokens: string[],
) {
  const haystack = tokenize(
    `${chunk.section || ""} ${chunk.section_name || ""} ${chunk.section_title || ""} ${chunk.topic || ""} ${chunk.content}`,
  );
  const counts = new Map<string, number>();
  for (const token of haystack) counts.set(token, (counts.get(token) || 0) + 1);
  const queryScore = queryTokens.reduce((score, token) => {
    const exact = counts.get(token) || 0;
    const partial = haystack.some(
      (word) => word.includes(token) || token.includes(word),
    )
      ? 0.5
      : 0;
    return score + exact + partial;
  }, 0);
  const sectionScore = sectionTokens.length
    ? sectionTokens.reduce(
        (score, token) => score + (counts.get(token) ? 2 : 0),
        0,
      )
    : 0;
  return queryScore + sectionScore;
}

export async function retrieveContext(
  question: string,
  unitNumber = 1,
  options: RetrieveOptions = {},
) {
  const queryTokens = tokenize(question);
  const sectionTokens = tokenize(options.section || "");
  if (queryTokens.length === 0 && sectionTokens.length === 0) return [];
  const db = createSupabaseAdmin();
  const { data: unit, error: unitError } = await db
    .from("units")
    .select("id,name,enabled")
    .eq("number", unitNumber)
    .single();
  if (unitError || !unit?.enabled) return [];
  const { data: documents, error: documentError } = await db
    .from("documents")
    .select("id,title,source,version,unit_id")
    .eq("unit_id", unit.id)
    .eq("status", "ready")
    .eq("active", true)
    .limit(50);
  if (documentError || !documents?.length) return [];
  const docs = documents as DocumentRow[];
  const docMap = new Map(docs.map((doc) => [doc.id, doc]));
  const { data: chunks, error: chunkError } = await db
    .from("document_chunks")
    .select(
      "id,document_id,content,section,section_name,section_title,topic,page",
    )
    .in(
      "document_id",
      docs.map((doc) => doc.id),
    )
    .order("chunk_index")
    .limit(1500);
  if (chunkError || !chunks?.length) return [];
  return (chunks as ChunkRow[])
    .map((chunk) => {
      const doc = docMap.get(chunk.document_id)!;
      return {
        chunkId: chunk.id,
        documentId: chunk.document_id,
        title: doc.title,
        source: doc.source,
        version: doc.version,
        unitName: unit.name as string,
        section: chunk.section,
        sectionName: chunk.section_name || chunk.section_title || chunk.topic,
        page: chunk.page,
        content: chunk.content,
        score: scoreChunk(chunk, queryTokens, sectionTokens),
      };
    })
    .filter((source) => source.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit || 5);
}
