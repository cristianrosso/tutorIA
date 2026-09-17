import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path = ".env.local") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function hash(value) {
  return createHash("sha256").update(normalize(value)).digest("hex");
}

function keywords(text) {
  const stop = new Set(["para", "como", "sobre", "entre", "desde", "este", "esta", "donde", "unidad", "tema", "policial", "policia"]);
  return [...new Set(normalize(text).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9ñ]+/).filter((word) => word.length > 4 && !stop.has(word)))].slice(0, 16);
}

async function embeddings(texts) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Falta OPENAI_API_KEY.");
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const dimensions = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || "1536");
  const timeoutMs = Number(process.env.KNOWLEDGE_INDEX_TIMEOUT_MS || "45000");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: texts.map(normalize), dimensions }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new Error(await response.text());
  const body = await response.json();
  return { model, vectors: body.data.map((item) => item.embedding) };
}

function vectorLiteral(vector) {
  return `[${vector.map((n) => Number(n).toFixed(8)).join(",")}]`;
}

loadEnv();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY.");
const db = createClient(url, key, { auth: { persistSession: false } });
const batchSize = Number(process.env.KNOWLEDGE_INDEX_BATCH || "12");
const maxChunks = Number(process.env.KNOWLEDGE_INDEX_MAX_CHUNKS || "0");
let processedCandidates = 0;

const docsRes = await db
  .from("documents")
  .select("id,unit_id,title,source,version,content_hash,units(id,number,name)")
  .eq("active", true)
  .eq("status", "ready")
  .limit(50);
if (docsRes.error) throw docsRes.error;
let indexed = 0;
let skipped = 0;
let failedEmbeddings = 0;
for (const doc of docsRes.data || []) {
  const unit = Array.isArray(doc.units) ? doc.units[0] : doc.units;
  const documentHash = doc.content_hash || hash(`${doc.title}-${doc.version}-${unit?.number}`);
  const academicDoc = await db
    .from("academic_documents")
    .upsert(
      {
        source_document_id: doc.id,
        title: doc.title,
        source: doc.source,
        document_version: doc.version || "2026",
        schema_version: "MKF-1.0",
        source_hash: documentHash,
        status: "PROCESSING",
        active: true,
      },
      { onConflict: "source_hash,document_version,schema_version" },
    )
    .select("id")
    .single();
  if (academicDoc.error) throw academicDoc.error;

  const academicUnit = await db
    .from("academic_units")
    .upsert(
      {
        academic_document_id: academicDoc.data.id,
        unit_id: unit?.id || doc.unit_id,
        unit_number: unit?.number || null,
        unit_name: unit?.name || "Unidad sin nombre",
        status: "PROCESSING",
        hierarchy: { unit_number: unit?.number, unit_name: unit?.name },
        validation: { detected_from: "document_chunks" },
        source_hash: documentHash,
      },
      { onConflict: "academic_document_id,unit_number" },
    )
    .select("id")
    .single();
  if (academicUnit.error) throw academicUnit.error;

  const chunks = [];
  for (let from = 0; ; from += 500) {
    const chunkRes = await db
      .from("document_chunks")
      .select("id,content,section,section_name,section_title,topic,page,page_start,page_end,metadata,chunk_index")
      .eq("document_id", doc.id)
      .order("chunk_index")
      .range(from, from + 499);
    if (chunkRes.error) throw chunkRes.error;
    chunks.push(...(chunkRes.data || []));
    if ((chunkRes.data || []).length < 500) break;
  }

  for (let index = 0; index < chunks.length; index += batchSize) {
    const batch = chunks.slice(index, index + batchSize);
    const pending = [];
    const prepared = [];
    for (const chunk of batch) {
      if (maxChunks > 0 && processedCandidates >= maxChunks) break;
      processedCandidates += 1;
      const sourceContent = normalize(chunk.content);
      if (!sourceContent) continue;
      const sourceHash = hash(sourceContent);
      const title = chunk.section_title || chunk.section_name || chunk.topic || `Fragmento ${chunk.chunk_index}`;
      const knowledgeId = `U${String(unit?.number || 0).padStart(2, "0")}-${sourceHash.slice(0, 16).toUpperCase()}`;
      const existing = await db
        .from("knowledge_chunks")
        .select("id")
        .eq("knowledge_object_id", knowledgeId)
        .eq("embedding_hash", sourceHash)
        .eq("embedding_model", process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small")
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data?.id) {
        skipped += 1;
        continue;
      }
      const topicNumber = chunk.section || chunk.metadata?.section_number || "SIN-SECCION";
      const topic = await db
        .from("academic_topics")
        .upsert(
          {
            academic_unit_id: academicUnit.data.id,
            topic_number: topicNumber,
            topic_name: title,
            sequence_index: chunk.chunk_index || 0,
            hierarchy: { unit_number: unit?.number, topic_name: title, section: topicNumber },
            validation: { detected_from: "document_chunks" },
            source_hash: hash(title),
          },
          { onConflict: "academic_unit_id,topic_number,topic_name" },
        )
        .select("id")
        .single();
      if (topic.error) throw topic.error;

      const ko = await db
        .from("knowledge_objects")
        .upsert(
          {
            id: knowledgeId,
            academic_document_id: academicDoc.data.id,
            academic_unit_id: academicUnit.data.id,
            academic_topic_id: topic.data.id,
            concept: title,
            title,
            content_type: /princip|valor|caracter|tipo/i.test(title) ? "ENUMERATION" : /proced|paso/i.test(sourceContent) ? "PROCEDURE" : "OTHER",
            source_content: sourceContent,
            source_scope: "OFFICIAL_SOURCE",
            hierarchy: {
              unit_id: `U${String(unit?.number || 0).padStart(2, "0")}`,
              unit_number: unit?.number,
              unit_name: unit?.name,
              topic_number: topicNumber,
              topic_name: title,
              section_number: topicNumber,
              section_name: title,
            },
            retrieval_metadata: { keywords: keywords(`${title} ${sourceContent}`) },
            provenance: {
              scope: "OFFICIAL_SOURCE",
              compendium: "Compendio FATESCIPOL El Alto – Examen de Grado 2026",
              original_source: doc.source,
              year: 2026,
              page_start: chunk.page_start || chunk.page || null,
              page_end: chunk.page_end || chunk.page || null,
              source_reference: topicNumber,
            },
            pedagogy: { generated_metadata: true, suitable_for_oral_exam: true },
            assessment: { can_generate_followup: true, expected_concepts: [] },
            validation: { source_preserved: true, requires_review: false, indexed_from_document_chunk: chunk.id },
            source_hash: sourceHash,
            version: 1,
            active: true,
          },
          { onConflict: "id" },
        )
        .select("id")
        .single();
      if (ko.error) throw ko.error;
      prepared.push({ chunk, topicId: topic.data.id, knowledgeId, sourceContent, sourceHash, title, keys: keywords(`${title} ${sourceContent}`) });
      pending.push(`${title}\n${sourceContent}`);
    }
    if (!prepared.length) {
      if (maxChunks > 0 && processedCandidates >= maxChunks) break;
      continue;
    }
    console.log(`Indexando lote: doc=${doc.title} preparados=${prepared.length} indexed=${indexed} skipped=${skipped}`);
    let generated;
    try {
      generated = await embeddings(pending);
    } catch (error) {
      failedEmbeddings += prepared.length;
      console.error("No se generaron embeddings para un lote:", error.message || error);
      continue;
    }
    for (let i = 0; i < prepared.length; i += 1) {
      const item = prepared[i];
      const vector = generated.vectors[i];
      const upsert = await db.from("knowledge_chunks").upsert(
        {
          knowledge_object_id: item.knowledgeId,
          parent_id: null,
          academic_unit_id: academicUnit.data.id,
          academic_topic_id: item.topicId,
          chunk_index: item.chunk.chunk_index || 0,
          chunk_type: "SOURCE",
          content: item.sourceContent,
          normalized_content: normalize(item.sourceContent).toLowerCase(),
          source_content: item.sourceContent,
          source_text: item.sourceContent,
          source_hash: item.sourceHash,
          source_reference: `${doc.source} · Unidad ${unit?.number} · ${item.title}`,
          page_reference: item.chunk.page ? `p. ${item.chunk.page}` : null,
          token_estimate: Math.ceil(item.sourceContent.split(/\s+/).length * 1.35),
          embedding: vectorLiteral(vector),
          embedding_model: generated.model,
          embedding_hash: item.sourceHash,
          keywords: item.keys,
          metadata: {
            unit_number: unit?.number,
            unit_name: unit?.name,
            topic_name: item.title,
            section_name: item.title,
            document_chunk_id: item.chunk.id,
          },
        },
        { onConflict: "knowledge_object_id,chunk_index" },
      );
      if (upsert.error) throw upsert.error;
      indexed += 1;
    }
  }
  if (maxChunks > 0 && processedCandidates >= maxChunks) {
    console.log(`Límite KNOWLEDGE_INDEX_MAX_CHUNKS alcanzado: ${maxChunks}`);
    break;
  }
  await db.from("academic_units").update({ status: "PROCESSED" }).eq("id", academicUnit.data.id);
  await db.from("academic_documents").update({ status: "PROCESSED" }).eq("id", academicDoc.data.id);
}
console.log(JSON.stringify({ indexed, skipped, failedEmbeddings }, null, 2));
