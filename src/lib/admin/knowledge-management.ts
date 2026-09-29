import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { splitDocument } from "@/lib/rag/chunk";
import { generateTutorText } from "@/lib/ai/openai";
import { estimateTextCost } from "@/lib/ai/costs";
import { recordAIUsage } from "@/lib/billing/ai-usage";
import { OFFICIAL_UNITS } from "@/lib/units";

const BUCKET = "academic-documents";
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set([
  "text/plain",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const SUPPORTED_EXTENSIONS = new Set(["txt", "pdf", "docx"]);
const MIGRATION_NAME = "202609230003_sprint18_knowledge_management.sql";

export type KnowledgeAdminSummary = {
  documents: Array<Record<string, unknown>>;
  totals: {
    documents: number;
    versions: number;
    published: number;
    reviewRequired: number;
    jobs: number;
  };
  migrationMissing: boolean;
  migrationName: string;
  warning?: string;
};

export type KnowledgeDocumentDetail = {
  document: Record<string, unknown>;
  versions: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  publications: Array<Record<string, unknown>>;
};

const emptyToUndefined = (value: unknown) => String(value || "").trim() || undefined;

const uploadSchema = z.object({
  productId: z.uuid(),
  title: z.string().trim().min(3).max(180),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(800).optional()),
  sourceLabel: z.string().trim().min(3).max(240),
  documentKind: z.enum(["COMPENDIUM", "SUPPLEMENT", "CORRECTION", "OTHER"]),
  versionLabel: z.string().trim().min(1).max(80),
  unitNumber: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(60).optional()),
  topicNumber: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  topicName: z.preprocess(emptyToUndefined, z.string().trim().max(180).optional()),
});

function sha256(buffer: Buffer | string) {
  return createHash("sha256").update(buffer).digest("hex");
}

function extensionOf(filename: string) {
  return filename.split(".").pop()?.toLowerCase() || "";
}

function normalizeText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\u0000/g, "")
    .replace(/[ \u00a0]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function slug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

function unitName(unitNumber?: number | null) {
  return OFFICIAL_UNITS.find((unit) => unit.number === unitNumber)?.name || null;
}

const DEFAULT_KNOWLEDGE_PRODUCT_ID = "00000000-0000-4000-8000-000000000101";

function publicationUnitName(input: {
  productId: string;
  unitNumber?: number | null;
  version: Record<string, unknown>;
  document?: Record<string, unknown> | null;
  chunks?: ReturnType<typeof splitDocument>;
}) {
  if (input.productId === DEFAULT_KNOWLEDGE_PRODUCT_ID) {
    return unitName(input.unitNumber) || (input.unitNumber ? `Unidad ${input.unitNumber}` : "Documento general");
  }
  const topicName = String(input.version.topic_name || "").trim();
  if (topicName) return topicName;
  const firstChunkTitle = input.chunks?.map((chunk) => chunk.section_name).find(Boolean);
  if (firstChunkTitle) return String(firstChunkTitle);
  const title = String(input.document?.title || "").trim();
  if (title) return title;
  return input.unitNumber ? `Unidad ${input.unitNumber}` : "Documento general";
}

async function extractTextFromFile(input: { name: string; type?: string }, buffer: Buffer) {
  const ext = extensionOf(input.name);
  if (ext === "txt" || input.type === "text/plain") {
    return normalizeText(buffer.toString("utf8"));
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return normalizeText(result.value || "");
  }
  if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return normalizeText(result.text || "");
    } finally {
      await parser.destroy();
    }
  }
  throw new Error("Formato no soportado. Usa PDF, DOCX o TXT.");
}

function buildValidationReport(input: {
  text: string;
  chunks: ReturnType<typeof splitDocument>;
  unitNumber?: number | null;
}) {
  const warnings: string[] = [];
  if (input.text.length < 500)
    warnings.push("El texto extraído es corto; revisar si el archivo se leyó completo.");
  if (!input.chunks.length)
    warnings.push("No se generaron fragmentos semánticos para RAG.");
  if (!input.unitNumber)
    warnings.push("No se indicó unidad; el contenido quedará como documento general de revisión.");
  const detectedSections = new Set(
    input.chunks.map((chunk) => chunk.section).filter(Boolean),
  );
  return {
    source_preserved: true,
    chunks: input.chunks.length,
    characters: input.text.length,
    words: input.text.split(/\s+/).filter(Boolean).length,
    detected_sections: detectedSections.size,
    requires_review: warnings.length > 0,
    warnings,
  };
}

type IntelligentChunkAnnotation = {
  chunk_index: number;
  topic_title?: string | null;
  section_title?: string | null;
  concept?: string | null;
  content_type?: string | null;
  keywords?: string[];
  search_terms?: string[];
  learning_objectives?: string[];
  explanation_focus?: string | null;
  oral_exam_focus?: string | null;
  confidence?: number;
};

const contentTypes = new Set([
  "DEFINITION",
  "ENUMERATION",
  "CLASSIFICATION",
  "PRINCIPLE",
  "VALUE",
  "CHARACTERISTIC",
  "RULE",
  "NORMATIVE",
  "ARTICLE",
  "PROCEDURE",
  "PROCEDURE_STEP",
  "REQUIREMENT",
  "EXCEPTION",
  "COMPARISON",
  "CAUSE_EFFECT",
  "EXAMPLE",
  "APPLICATION",
  "CASE",
  "FORMULA",
  "METHODOLOGY",
  "SOURCE_NOTE",
  "GENERAL_ACADEMIC_KNOWLEDGE",
  "OTHER",
]);


function limitText(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? normalized.slice(0, max - 1).trim() : normalized;
}

function cleanJsonText(text: string) {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function parseAnnotationJson(text: string): IntelligentChunkAnnotation[] {
  const cleaned = cleanJsonText(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as { chunks?: unknown };
    if (!Array.isArray(parsed.chunks)) return [];
    return parsed.chunks.map((item) => normalizeAnnotation(item)).filter(Boolean) as IntelligentChunkAnnotation[];
  } catch {
    return [];
  }
}

function normalizeAnnotation(item: unknown): IntelligentChunkAnnotation | null {
  const row = (item || {}) as Record<string, unknown>;
  const chunkIndex = Number(row.chunk_index);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) return null;
  const contentType = String(row.content_type || "OTHER").toUpperCase();
  return {
    chunk_index: chunkIndex,
    topic_title: limitText(String(row.topic_title || "").trim(), 120) || null,
    section_title: limitText(String(row.section_title || "").trim(), 140) || null,
    concept: limitText(String(row.concept || "").trim(), 120) || null,
    content_type: contentTypes.has(contentType) ? contentType : "OTHER",
    keywords: normalizeShortList(row.keywords).slice(0, 10),
    search_terms: normalizeShortList(row.search_terms).slice(0, 10),
    learning_objectives: normalizeShortList(row.learning_objectives).slice(0, 4),
    explanation_focus: limitText(String(row.explanation_focus || "").trim(), 260) || null,
    oral_exam_focus: limitText(String(row.oral_exam_focus || "").trim(), 220) || null,
    confidence: Math.max(0, Math.min(1, Number(row.confidence || 0.55))),
  };
}

function normalizeShortList(value: unknown) {
  return (Array.isArray(value) ? value : [])
    .map((item) => limitText(String(item || "").replace(/\s+/g, " ").trim(), 90))
    .filter((item) => item.length > 2);
}

async function buildIntelligentAnnotations(input: {
  chunks: ReturnType<typeof splitDocument>;
  title: string;
  sourceLabel: string;
  userId: string;
}) {
  const maxChunks = Number(process.env.KNOWLEDGE_AI_MAX_CHUNKS || 12);
  const batchSize = Number(process.env.KNOWLEDGE_AI_BATCH_SIZE || 6);
  const maxBatches = Number(process.env.KNOWLEDGE_AI_MAX_BATCHES || 1);
  const selected = input.chunks.slice(0, Math.max(0, maxChunks));
  if (!selected.length) return { annotations: [] as IntelligentChunkAnnotation[], usage: null as null | { model: string; inputTokens: number; outputTokens: number; estimatedCost: number } };
  const annotations: IntelligentChunkAnnotation[] = [];
  let usedModel = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalEstimatedCost = 0;
  const model = process.env.OPENAI_KNOWLEDGE_MODEL || process.env.OPENAI_ECONOMY_MODEL || process.env.OPENAI_FAST_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-luna";
  for (let offset = 0, batchNumber = 0; offset < selected.length && batchNumber < maxBatches; offset += batchSize, batchNumber += 1) {
    const batch = selected.slice(offset, offset + batchSize);
    const payload = batch.map((chunk) => ({
      chunk_index: chunk.chunk_index,
      heading: chunk.section_name || chunk.topic || null,
      section: chunk.section,
      text: limitText(chunk.content, 1100),
    }));
    const completion = await generateTutorText({
      model,
      maxOutputTokens: 1600,
      system: "Eres un analista académico. Lees material fuente y produces solo metadata pedagógica para RAG. No reescribes ni sustituyes el texto oficial.",
      user: `Documento: ${input.title}
Fuente: ${input.sourceLabel}

Analiza estos fragmentos y devuelve JSON estricto con forma {"chunks":[...]}.
Para cada fragmento devuelve: chunk_index, topic_title, section_title, concept, content_type, keywords, search_terms, learning_objectives, explanation_focus, oral_exam_focus, confidence.
Reglas:
- Conserva el sentido académico del texto.
- No inventes normas, artículos, fechas ni datos.
- topic_title debe ser natural y útil para navegar.
- concept debe ser el concepto principal evaluable.
- content_type debe ser uno de: ${[...contentTypes].join(", ")}.
- explanation_focus debe orientar cómo explicarlo como profesor experto, sin copiar largos párrafos.

Fragmentos:
${JSON.stringify(payload)}`,
    });
    annotations.push(...parseAnnotationJson(completion.text));
    usedModel = completion.model;
    totalInputTokens += completion.inputTokens;
    totalOutputTokens += completion.outputTokens;
    totalEstimatedCost += estimateTextCost(completion.inputTokens, completion.outputTokens, completion.model);
  }
  const usage = usedModel
    ? {
        model: usedModel,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        estimatedCost: totalEstimatedCost,
      }
    : null;
  if (usage) {
    await recordAIUsage({
      userId: input.userId,
      operationId: `knowledge-ai:${sha256(`${input.title}:${input.sourceLabel}:${annotations.length}:${Date.now()}`)}`,
      operationType: "other",
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd: usage.estimatedCost,
      costIsEstimated: false,
      otherBillableUnits: { feature: "knowledge_intelligent_processing", annotations: annotations.length },
    }).catch(() => undefined);
  }
  return { annotations, usage };
}

function fallbackAnnotationForChunk(chunk: ReturnType<typeof splitDocument>[number]): IntelligentChunkAnnotation {
  const title = chunk.section_name || chunk.topic || firstMeaningfulLine(chunk.content) || "Contenido académico";
  const concept = title.replace(/^\d+(?:\.\d+)*\s*[.-]?\s*/, "").trim();
  const keywords = Array.from(new Set([concept, ...chunk.content.split(/\s+/).slice(0, 80)]
    .map((item) => item.toLowerCase().replace(/[^a-záéíóúñ0-9]/gi, ""))
    .filter((item) => item.length > 4)))
    .slice(0, 10);
  return {
    chunk_index: chunk.chunk_index,
    topic_title: concept,
    section_title: chunk.section_name || concept,
    concept,
    content_type: inferContentType(chunk.content),
    keywords,
    search_terms: keywords,
    learning_objectives: [`Explicar ${concept}`, `Aplicar ${concept} en contexto académico`].slice(0, 2),
    explanation_focus: `Explicar ${concept} con base en el documento fuente y un ejemplo aplicado.`,
    oral_exam_focus: `Responder qué es ${concept}, sus elementos principales y su utilidad práctica.`,
    confidence: chunk.section_name ? 0.62 : 0.52,
  };
}

function firstMeaningfulLine(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find((line) => line.length >= 8 && line.length <= 140) || null;
}
function inferContentType(text: string) {
  if (/\b(art[ií]culo|ley|decreto|reglamento|norma|resoluci[oó]n)\b/i.test(text)) return "NORMATIVE";
  if (/\b(pasos|procedimiento|proceso|etapas|fases)\b/i.test(text)) return "PROCEDURE";
  if (/\b(se define|es el|es la|concepto|definici[oó]n)\b/i.test(text)) return "DEFINITION";
  if (/\b(clasificaci[oó]n|tipos|clases)\b/i.test(text)) return "CLASSIFICATION";
  if (/[:;]\s*(primero|1\.|a\)|-)/i.test(text)) return "ENUMERATION";
  return "OTHER";
}
function annotationMap(report: Record<string, unknown> | null | undefined) {
  const raw = report?.ai_annotations;
  const list = Array.isArray(raw) ? raw : [];
  const map = new Map<number, IntelligentChunkAnnotation>();
  for (const item of list) {
    const annotation = normalizeAnnotation(item);
    if (annotation) map.set(annotation.chunk_index, annotation);
  }
  return map;
}

function annotationForChunk(map: Map<number, IntelligentChunkAnnotation>, chunkIndex: number) {
  return map.get(chunkIndex) || null;
}

function annotationTitle(annotation: IntelligentChunkAnnotation | null, fallback: string) {
  return annotation?.section_title || annotation?.topic_title || annotation?.concept || fallback;
}

function assertSupportedFile(file: File) {
  const ext = extensionOf(file.name);
  if (!SUPPORTED_EXTENSIONS.has(ext))
    throw new Error("Formato no soportado. Solo PDF, DOCX o TXT.");
  if (file.type && !SUPPORTED_MIME_TYPES.has(file.type)) {
    throw new Error("Tipo MIME no permitido para la biblioteca académica.");
  }
  if (file.size < 20) throw new Error("El archivo está vacío o incompleto.");
  if (file.size > MAX_FILE_BYTES)
    throw new Error("El archivo supera el límite de 50 MB.");
}

function emptyKnowledgeSummary(input?: { migrationMissing?: boolean; warning?: string }): KnowledgeAdminSummary {
  return {
    documents: [],
    totals: { documents: 0, versions: 0, published: 0, reviewRequired: 0, jobs: 0 },
    migrationMissing: Boolean(input?.migrationMissing),
    migrationName: MIGRATION_NAME,
    warning: input?.warning,
  };
}

function isKnowledgeSchemaIssue(message?: string | null) {
  return /(knowledge_admin_documents|knowledge_document_versions|knowledge_processing_jobs|knowledge_publications|product_id|academic_products|relationship|schema cache|does not exist|column .* does not exist)/i.test(
    String(message || ""),
  );
}


async function createJob(input: {
  documentId: string;
  versionId: string;
  jobType: "extract" | "structure" | "publish" | "rollback" | "validate";
  userId: string;
}) {
  const db = createSupabaseAdmin();
  const { data, error } = await db
    .from("knowledge_processing_jobs")
    .insert({
      document_id: input.documentId,
      version_id: input.versionId,
      job_type: input.jobType,
      status: "processing",
      started_at: new Date().toISOString(),
      created_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) throw error || new Error("No se pudo crear el trabajo.");
  return data.id as string;
}

async function finishJob(
  id: string,
  status: "completed" | "failed",
  report: Record<string, unknown>,
  errorMessage?: string,
) {
  await createSupabaseAdmin()
    .from("knowledge_processing_jobs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      report,
      error_message: errorMessage || null,
    })
    .eq("id", id);
}

export async function listKnowledgeDocuments(): Promise<KnowledgeAdminSummary> {
  const db = createSupabaseAdmin();
  const productAwareQuery = await db
    .from("knowledge_admin_documents")
    .select("id,title,description,source_label,document_kind,status,active_version_id,product_id,created_at,updated_at,academic_products(short_name,name,slug)")
    .order("updated_at", { ascending: false })
    .limit(50);

  let rows: Array<Record<string, unknown>> = ((productAwareQuery.data || []) as unknown) as Array<Record<string, unknown>>;
  let queryError = productAwareQuery.error;
  if (queryError && isKnowledgeSchemaIssue(queryError.message)) {
    const fallback = await db
      .from("knowledge_admin_documents")
      .select("id,title,description,source_label,document_kind,status,active_version_id,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    rows = ((fallback.data || []) as unknown) as Array<Record<string, unknown>>;
    queryError = fallback.error;
  }

  if (queryError) {
    if (isKnowledgeSchemaIssue(queryError.message)) {
      return emptyKnowledgeSummary({ migrationMissing: true, warning: queryError.message });
    }
    return emptyKnowledgeSummary({ warning: queryError.message });
  }

  const documents = rows;
  const documentIds = documents.map((doc) => String(doc.id)).filter(Boolean);
  const { data: versions, error: versionsError } = documentIds.length
    ? await db
        .from("knowledge_document_versions")
        .select("id,document_id,version_label,processing_status,unit_number,topic_number,topic_name,created_at,published_at")
        .in("document_id", documentIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  const versionsByDocument = new Map<string, Array<Record<string, unknown>>>();
  if (versionsError) {
    if (!isKnowledgeSchemaIssue(versionsError.message)) {
      return emptyKnowledgeSummary({ warning: versionsError.message });
    }
  } else {
    for (const version of (versions || []) as Array<Record<string, unknown>>) {
      const documentId = String(version.document_id || "");
      const current = versionsByDocument.get(documentId) || [];
      current.push(version);
      versionsByDocument.set(documentId, current);
    }
  }
  const documentsWithVersions = documents.map((doc) => ({
    ...doc,
    knowledge_document_versions: versionsByDocument.get(String(doc.id)) || [],
  }));
  const versionCount = documents.reduce((sum, doc) => {
    const versions = versionsByDocument.get(String(doc.id)) || [];
    return sum + (Array.isArray(versions) ? versions.length : 0);
  }, 0);
  return {
    documents: documentsWithVersions,
    totals: {
      documents: documents.length,
      versions: versionCount,
      published: documents.filter((doc) => doc.status === "published").length,
      reviewRequired: documents.filter((doc) => doc.status === "review_required").length,
      jobs: 0,
    },
    migrationMissing: Boolean(versionsError && isKnowledgeSchemaIssue(versionsError.message)),
    migrationName: MIGRATION_NAME,
    warning: versionsError?.message,
  };
}

export async function getKnowledgeDocumentDetail(
  documentId: string,
): Promise<KnowledgeDocumentDetail | null> {
  const db = createSupabaseAdmin();
  const { data: document, error } = await db
    .from("knowledge_admin_documents")
    .select("*")
    .eq("id", documentId)
    .single();
  if (error || !document) return null;
  const [versions, jobs, publications] = await Promise.all([
    db
      .from("knowledge_document_versions")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false }),
    db
      .from("knowledge_processing_jobs")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(20),
    db
      .from("knowledge_publications")
      .select("*")
      .eq("document_id", documentId)
      .order("published_at", { ascending: false })
      .limit(20),
  ]);
  return {
    document: document as Record<string, unknown>,
    versions: (versions.data || []) as Array<Record<string, unknown>>,
    jobs: (jobs.data || []) as Array<Record<string, unknown>>,
    publications: (publications.data || []) as Array<Record<string, unknown>>,
  };
}

export async function uploadKnowledgeDocument(form: FormData, userId: string) {
  const file = form.get("file");
  if (!(file instanceof File)) throw new Error("Selecciona un archivo PDF, DOCX o TXT.");
  assertSupportedFile(file);
  const parsed = uploadSchema.parse({
    productId: form.get("productId"),
    title: form.get("title"),
    description: form.get("description") || undefined,
    sourceLabel: form.get("sourceLabel") || undefined,
    documentKind: form.get("documentKind") || "COMPENDIUM",
    versionLabel: form.get("versionLabel") || "v1",
    unitNumber: form.get("unitNumber") || undefined,
    topicNumber: form.get("topicNumber") || undefined,
    topicName: form.get("topicName") || undefined,
  });
  const db = createSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const sourceHash = sha256(buffer);
  const existing = await db
    .from("knowledge_document_versions")
    .select("id,document_id")
    .eq("source_hash", sourceHash)
    .maybeSingle();
  if (existing.data?.id) {
    throw new Error("Este archivo ya fue cargado. El hash de fuente coincide con una versión existente.");
  }

  const storagePath = `${userId}/${Date.now()}-${slug(file.name) || "documento"}.${extensionOf(file.name)}`;
  const upload = await db.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upload.error) throw new Error(`No se pudo guardar el archivo privado: ${upload.error.message}`);

  const { data: document, error: documentError } = await db
    .from("knowledge_admin_documents")
    .insert({
      title: parsed.title,
      description: parsed.description || null,
      source_label: parsed.sourceLabel,
      document_kind: parsed.documentKind,
      status: "uploaded",
      created_by: userId,
      product_id: parsed.productId,
    })
    .select("id")
    .single();
  if (documentError || !document)
    throw new Error(documentError?.message || "No se pudo registrar el documento.");

  const { data: version, error: versionError } = await db
    .from("knowledge_document_versions")
    .insert({
      document_id: document.id,
      version_label: parsed.versionLabel,
      original_filename: file.name,
      mime_type: file.type || "application/octet-stream",
      storage_path: storagePath,
      file_size_bytes: file.size,
      source_hash: sourceHash,
      unit_number: parsed.unitNumber || null,
      topic_number: parsed.topicNumber || null,
      topic_name: parsed.topicName || null,
      created_by: userId,
      product_id: parsed.productId,
    })
    .select("id")
    .single();
  if (versionError || !version)
    throw new Error(versionError?.message || "No se pudo registrar la versión.");

  return { documentId: document.id as string, versionId: version.id as string };
}

export async function processKnowledgeVersion(versionId: string, userId: string) {
  const db = createSupabaseAdmin();
  const { data: version, error } = await db
    .from("knowledge_document_versions")
    .select("*")
    .eq("id", versionId)
    .single();
  if (error || !version) throw new Error("No se encontró la versión del documento.");

  const jobId = await createJob({
    documentId: version.document_id as string,
    versionId,
    jobType: "structure",
    userId,
  });

  try {
    await db
      .from("knowledge_document_versions")
      .update({ processing_status: "processing", extraction_status: "pending" })
      .eq("id", versionId);
    await db
      .from("knowledge_admin_documents")
      .update({ status: "processing" })
      .eq("id", version.document_id);

    let buffer: Buffer;
    if (version.storage_path) {
      const download = await db.storage.from(BUCKET).download(version.storage_path as string);
      if (download.error || !download.data)
        throw new Error(download.error?.message || "No se pudo leer el archivo privado.");
      buffer = Buffer.from(await download.data.arrayBuffer());
    } else {
      throw new Error("La versión no tiene archivo asociado en Storage.");
    }

    const text = await extractTextFromFile(
      { name: version.original_filename as string, type: version.mime_type as string },
      buffer,
    );
    if (text.length < 80) throw new Error("No se pudo extraer texto académico suficiente del archivo.");
    const chunks = splitDocument(text);
    const validation = buildValidationReport({
      text,
      chunks,
      unitNumber: version.unit_number as number | null,
    });
    const { data: document } = await db
      .from("knowledge_admin_documents")
      .select("title,source_label")
      .eq("id", version.document_id)
      .maybeSingle();
    let intelligence: Awaited<ReturnType<typeof buildIntelligentAnnotations>> | null = null;
    const runAiDuringProcess = process.env.KNOWLEDGE_AI_DURING_PROCESS === "true";
    if (runAiDuringProcess) {
      try {
        intelligence = await buildIntelligentAnnotations({
          chunks,
          title: String(document?.title || version.original_filename || "Documento académico"),
          sourceLabel: String(document?.source_label || "Documento académico"),
          userId,
        });
      } catch (error) {
        validation.warnings.push(
          `La extracción básica terminó, pero la lectura inteligente falló: ${error instanceof Error ? error.message : "error desconocido"}`,
        );
      }
    } else {
      validation.warnings.push(
        "Lectura inteligente profunda diferida para evitar timeout; el documento queda estructurado y puede publicarse con metadata académica determinística.",
      );
    }
    const aiAnnotations = intelligence?.annotations || [];
    const enrichedValidation = {
      ...validation,
      ai_processed: Boolean(aiAnnotations.length),
      ai_annotations: aiAnnotations,
      ai_usage: intelligence?.usage || null,
      warnings: [
        ...validation.warnings,
        ...(aiAnnotations.length && aiAnnotations.length < chunks.length
          ? [`Lectura inteligente aplicada a ${aiAnnotations.length} de ${chunks.length} fragmentos; el resto usará metadata determinística al publicar.`]
          : []),
      ],
    };

    await db
      .from("knowledge_document_versions")
      .update({
        extracted_text: text,
        extraction_status: "extracted",
        processing_status: enrichedValidation.requires_review ? "review_required" : "processed",
        validation_report: enrichedValidation,
      })
      .eq("id", versionId);
    await db
      .from("knowledge_admin_documents")
      .update({ status: enrichedValidation.requires_review ? "review_required" : "processed" })
      .eq("id", version.document_id);
    await finishJob(jobId, "completed", enrichedValidation);
    return enrichedValidation;
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo procesar el documento.";
    await db
      .from("knowledge_document_versions")
      .update({ extraction_status: "failed", processing_status: "failed", validation_report: { error: message } })
      .eq("id", versionId);
    await db
      .from("knowledge_admin_documents")
      .update({ status: "failed" })
      .eq("id", version.document_id);
    await finishJob(jobId, "failed", { error: message }, message);
    throw new Error(message);
  }
}

function topicTitle(version: Record<string, unknown>, chunk: ReturnType<typeof splitDocument>[number]) {
  return (
    (chunk.section_name as string | null) ||
    (version.topic_name as string | null) ||
    `Contenido académico ${version.unit_number ? `Unidad ${version.unit_number}` : "general"}`
  );
}

function buildKnowledgeId(input: {
  versionId: string;
  unitNumber?: number | null;
  chunkIndex: number;
  title: string;
}) {
  const unit = input.unitNumber ? `U${String(input.unitNumber).padStart(2, "0")}` : "GEN";
  return `S18-${input.versionId.slice(0, 8).toUpperCase()}-${unit}-${String(input.chunkIndex + 1).padStart(4, "0")}-${slug(input.title).slice(0, 24).toUpperCase()}`;
}

export async function publishKnowledgeVersion(versionId: string, userId: string) {
  const db = createSupabaseAdmin();
  const { data: version, error } = await db
    .from("knowledge_document_versions")
    .select("*")
    .eq("id", versionId)
    .single();
  if (error || !version) throw new Error("No se encontró la versión.");
  const { data: document } = await db
    .from("knowledge_admin_documents")
    .select("id,title,source_label,document_kind,product_id")
    .eq("id", version.document_id)
    .maybeSingle();
  const text = normalizeText(String(version.extracted_text || ""));
  if (text.length < 80) throw new Error("Procesa el documento antes de publicarlo.");

  const jobId = await createJob({ documentId: version.document_id as string, versionId, jobType: "publish", userId });
  try {
    const chunks = splitDocument(text);
    if (!chunks.length) throw new Error("No hay fragmentos válidos para publicar.");
    const baseReport = buildValidationReport({ text, chunks, unitNumber: version.unit_number as number | null });
    const storedReport = (version.validation_report || {}) as Record<string, unknown>;
    const annotations = annotationMap(storedReport);
    const report = {
      ...baseReport,
      ai_processed: Boolean(annotations.size),
      ai_annotations: Array.isArray(storedReport.ai_annotations) ? storedReport.ai_annotations : [],
      ai_usage: storedReport.ai_usage || null,
      warnings: [
        ...baseReport.warnings,
        ...(annotations.size ? [] : ["Publicación sin lectura inteligente previa; vuelve a Procesar para mejorar estructura pedagógica."]),
      ],
    };
    const productId = String(version.product_id || document?.product_id || DEFAULT_KNOWLEDGE_PRODUCT_ID);
    const sourceLabel = String(document?.source_label || "Documento académico FATESCIPOL");
    const title = String(document?.title || version.original_filename || "Documento académico");
    const resolvedUnitName = publicationUnitName({
      productId,
      unitNumber: version.unit_number as number | null,
      version,
      document: document as Record<string, unknown> | null,
      chunks,
    });
    const sourceHash = sha256(text);
    const { data: academicDocument, error: academicError } = await db
      .from("academic_documents")
      .upsert(
        {
          title,
          source: sourceLabel,
          document_version: String(version.version_label || "v1"),
          schema_version: "MKF-1.0",
          source_hash: sourceHash,
          status: report.requires_review ? "REVIEW_REQUIRED" : "PROCESSED",
          report,
          active: true,
          product_id: productId,
        },
        { onConflict: "source_hash,document_version,schema_version" },
      )
      .select("id")
      .single();
    if (academicError || !academicDocument)
      throw new Error(academicError?.message || "No se pudo crear o actualizar el documento académico MKF-1.");

    const { error: cleanupError } = await db
      .from("academic_units")
      .delete()
      .eq("academic_document_id", academicDocument.id);
    if (cleanupError) throw new Error(cleanupError.message || "No se pudo limpiar la publicación anterior.");

    let academicUnitId: string | null = null;
    if (version.unit_number) {
      const { data: unitRow } = await db
        .from("units")
        .select("id")
        .eq("number", version.unit_number)
        .maybeSingle();
      const { data: academicUnit, error: academicUnitError } = await db
        .from("academic_units")
        .insert({
          academic_document_id: academicDocument.id,
          unit_id: unitRow?.id || null,
          unit_number: version.unit_number,
          unit_name: resolvedUnitName,
          status: report.requires_review ? "REVIEW_REQUIRED" : "PROCESSED",
          hierarchy: { unit_number: version.unit_number, unit_name: resolvedUnitName },
          validation: report,
          source_hash: sha256(`${version.unit_number}\n${text}`),
          product_id: productId,
        })
        .select("id")
        .single();
      if (academicUnitError || !academicUnit)
        throw new Error(academicUnitError?.message || "No se pudo crear la unidad académica.");
      academicUnitId = academicUnit.id as string;
    } else {
      const { data: academicUnit, error: academicUnitError } = await db
        .from("academic_units")
        .insert({
          academic_document_id: academicDocument.id,
          unit_number: 1,
          unit_name: resolvedUnitName,
          status: "REVIEW_REQUIRED",
          hierarchy: { unit_number: 1, unit_name: resolvedUnitName },
          validation: { ...report, requires_review: true },
          source_hash: sha256(`${resolvedUnitName}\n${text}`),
          product_id: productId,
        })
        .select("id")
        .single();
      if (academicUnitError || !academicUnit)
        throw new Error(academicUnitError?.message || "No se pudo crear unidad general.");
      academicUnitId = academicUnit.id as string;
    }

    const topicMap = new Map<string, string>();
    for (const [index, chunk] of chunks.entries()) {
      const annotation = annotationForChunk(annotations, chunk.chunk_index) || fallbackAnnotationForChunk(chunk);
      const name = annotationTitle(annotation, topicTitle(version, chunk));
      const number = chunk.section || (version.topic_number as string | null) || null;
      const topicKey = `${number || ""}|${name}`;
      let topicId = topicMap.get(topicKey);
      if (!topicId) {
        const { data: topic, error: topicError } = await db
          .from("academic_topics")
          .insert({
            academic_unit_id: academicUnitId,
            topic_number: number,
            topic_name: name,
            sequence_index: topicMap.size,
            hierarchy: {
              unit_number: version.unit_number || null,
              unit_name: resolvedUnitName,
              topic_number: number,
              topic_name: name,
            },
            validation: { source_preserved: true },
            source_hash: sha256(`${number || ""}\n${name}`),
            product_id: productId,
          })
          .select("id")
          .single();
        if (topicError || !topic)
          throw new Error(topicError?.message || "No se pudo crear un tema académico.");
        topicId = topic.id as string;
        topicMap.set(topicKey, topicId);
      }

      const objectId = buildKnowledgeId({
        versionId,
        unitNumber: version.unit_number as number | null,
        chunkIndex: index,
        title: name,
      });
      const hierarchy = {
        unit_number: version.unit_number || null,
        unit_name: resolvedUnitName,
        topic_number: number,
        topic_name: name,
        section_number: chunk.section,
        section_name: chunk.section_name,
      };
      const keywords = Array.from(
        new Set(
          [
            name,
            annotation?.concept,
            annotation?.topic_title,
            annotation?.section_title,
            chunk.topic,
            chunk.section_name,
            ...(annotation?.keywords || []),
            ...(annotation?.search_terms || []),
          ]
            .filter(Boolean)
            .flatMap((item) => String(item).split(/\s+/))
            .map((item) => item.toLowerCase().replace(/[^a-záéíóúñ0-9]/gi, ""))
            .filter((item) => item.length > 3)
            .slice(0, 28),
        ),
      );
      const objectHash = sha256(chunk.content);
      const { error: objectError } = await db.from("knowledge_objects").insert({
        id: objectId,
        academic_document_id: academicDocument.id,
        academic_unit_id: academicUnitId,
        academic_topic_id: topicId,
        concept: annotation?.concept || name,
        title: name,
        content_type: annotation?.content_type || (chunk.section_name ? "SOURCE_NOTE" : "OTHER"),
        source_content: chunk.content,
        source_scope: "OFFICIAL_SOURCE",
        hierarchy,
        retrieval_metadata: {
          keywords,
          aliases: annotation?.concept ? [annotation.concept] : [],
          related_concepts: annotation?.keywords || [],
          search_terms: annotation?.search_terms?.length ? annotation.search_terms : keywords,
        },
        provenance: {
          scope: "OFFICIAL_SOURCE",
          compendium: sourceLabel,
          original_source: version.original_filename,
          year: null,
          page_start: chunk.page,
          page_end: chunk.page,
          source_reference: sourceLabel,
        },
        pedagogy: {
          generated_metadata: true,
          importance: "MEDIUM",
          difficulty: "INTERMEDIATE",
          learning_objectives: annotation?.learning_objectives || [],
          prerequisites: [],
          common_confusions: annotation?.explanation_focus ? [annotation.explanation_focus] : [],
          suitable_for_example: true,
          suitable_for_case: true,
          suitable_for_oral_exam: true,
        },
        assessment: {
          can_ask_definition: true,
          can_ask_enumeration: false,
          can_ask_explanation: true,
          can_ask_comparison: false,
          can_ask_application: true,
          can_ask_ordering: false,
          can_generate_followup: true,
          expected_concepts: [],
        },
        validation: {
          structure_valid: true,
          source_preserved: true,
          classification_confidence: annotation?.confidence || (chunk.section_name ? 0.72 : 0.55),
          hierarchy_confidence: annotation?.confidence || (chunk.section ? 0.74 : 0.6),
          requires_review: annotation ? (annotation.confidence || 0) < 0.68 : !chunk.section_name,
          warnings: annotation ? [] : (chunk.section_name ? [] : ["Clasificación automática básica; requiere revisión académica."]),
        },
        source_hash: objectHash,
        product_id: productId,
      });
      if (objectError) throw new Error(objectError.message);
      const { error: chunkError } = await db.from("knowledge_chunks").insert({
        knowledge_object_id: objectId,
        chunk_index: 0,
        source_content: chunk.content,
        source_hash: objectHash,
        token_estimate: Math.ceil(chunk.content.length / 4),
        parent_id: null,
        academic_unit_id: academicUnitId,
        academic_topic_id: topicId,
        chunk_type: "SOURCE",
        content: [
          annotation?.topic_title ? `Tema: ${annotation.topic_title}` : null,
          annotation?.concept ? `Concepto: ${annotation.concept}` : null,
          annotation?.explanation_focus ? `Enfoque didáctico: ${annotation.explanation_focus}` : null,
          chunk.content,
        ].filter(Boolean).join("\n\n"),
        normalized_content: [keywords.join(" "), chunk.content].join(" ").toLowerCase().replace(/\s+/g, " "),
        source_text: chunk.content,
        source_reference: sourceLabel,
        page_reference: chunk.page ? String(chunk.page) : null,
        token_count: Math.ceil(chunk.content.length / 4),
        embedding_hash: objectHash,
        keywords,
        metadata: {
          ...hierarchy,
          ai_topic_title: annotation?.topic_title || null,
          ai_concept: annotation?.concept || null,
          ai_content_type: annotation?.content_type || null,
          ai_explanation_focus: annotation?.explanation_focus || null,
          ai_oral_exam_focus: annotation?.oral_exam_focus || null,
          ai_confidence: annotation?.confidence || null,
        },
        product_id: productId,
      });
      if (chunkError) throw new Error(chunkError.message);
    }

    await db
      .from("knowledge_document_versions")
      .update({
        processing_status: "published",
        academic_document_id: academicDocument.id,
        published_by: userId,
        published_at: new Date().toISOString(),
        validation_report: report,
      })
      .eq("id", versionId);
    await db
      .from("knowledge_admin_documents")
      .update({ status: "published", active_version_id: versionId })
      .eq("id", version.document_id);
    await db.from("knowledge_publications").insert({
      document_id: version.document_id,
      version_id: versionId,
      academic_document_id: academicDocument.id,
      published_by: userId,
      product_id: productId,
      notes: "Publicación generada desde Sprint 18 sin modificar el texto fuente.",
    });
    await finishJob(jobId, "completed", { ...report, academic_document_id: academicDocument.id });
    return { academicDocumentId: academicDocument.id as string, report };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo publicar la versión.";
    await finishJob(jobId, "failed", { error: message }, message);
    throw new Error(message);
  }
}

export async function rollbackKnowledgeVersion(versionId: string, userId: string) {
  const db = createSupabaseAdmin();
  const { data: version, error } = await db
    .from("knowledge_document_versions")
    .select("id,document_id,academic_document_id")
    .eq("id", versionId)
    .single();
  if (error || !version) throw new Error("No se encontró la versión para rollback.");
  if (!version.academic_document_id) throw new Error("La versión no tiene publicación activa para revertir.");
  const jobId = await createJob({ documentId: version.document_id as string, versionId, jobType: "rollback", userId });
  try {
    await db
      .from("academic_documents")
      .update({ active: false, status: "FAILED" })
      .eq("id", version.academic_document_id);
    await db
      .from("knowledge_document_versions")
      .update({ processing_status: "rolled_back" })
      .eq("id", versionId);
    await db
      .from("knowledge_publications")
      .update({ status: "rolled_back", rolled_back_by: userId, rolled_back_at: new Date().toISOString() })
      .eq("version_id", versionId)
      .eq("status", "published");
    await db
      .from("knowledge_admin_documents")
      .update({ status: "processed", active_version_id: null })
      .eq("id", version.document_id);
    await finishJob(jobId, "completed", { rolled_back: true, academic_document_id: version.academic_document_id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo revertir la publicación.";
    await finishJob(jobId, "failed", { error: message }, message);
    throw new Error(message);
  }
}

export function sprint18MigrationName() {
  return MIGRATION_NAME;
}




