import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { splitDocument } from "@/lib/rag/chunk";
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
};

export type KnowledgeDocumentDetail = {
  document: Record<string, unknown>;
  versions: Array<Record<string, unknown>>;
  jobs: Array<Record<string, unknown>>;
  publications: Array<Record<string, unknown>>;
};

const uploadSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(800).optional(),
  sourceLabel: z.string().trim().min(3).max(240),
  documentKind: z.enum(["COMPENDIUM", "SUPPLEMENT", "CORRECTION", "OTHER"]),
  versionLabel: z.string().trim().min(1).max(80),
  unitNumber: z.coerce.number().int().min(1).max(15).optional(),
  topicNumber: z.string().trim().max(40).optional(),
  topicName: z.string().trim().max(180).optional(),
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
  const { data, error } = await db
    .from("knowledge_admin_documents")
    .select(
      "id,title,description,source_label,document_kind,status,active_version_id,created_at,updated_at,knowledge_document_versions(id,version_label,processing_status,unit_number,topic_number,topic_name,created_at,published_at)",
    )
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    if (/knowledge_admin_documents/i.test(error.message)) {
      return {
        documents: [],
        totals: { documents: 0, versions: 0, published: 0, reviewRequired: 0, jobs: 0 },
        migrationMissing: true,
        migrationName: MIGRATION_NAME,
      };
    }
    throw new Error(error.message);
  }

  const documents = (data || []) as Array<Record<string, unknown>>;
  const versionCount = documents.reduce((sum, doc) => {
    const versions = doc.knowledge_document_versions;
    return sum + (Array.isArray(versions) ? versions.length : 0);
  }, 0);
  return {
    documents,
    totals: {
      documents: documents.length,
      versions: versionCount,
      published: documents.filter((doc) => doc.status === "published").length,
      reviewRequired: documents.filter((doc) => doc.status === "review_required").length,
      jobs: 0,
    },
    migrationMissing: false,
    migrationName: MIGRATION_NAME,
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
    .select("*,knowledge_admin_documents(id,title,source_label,document_kind)")
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

    await db
      .from("knowledge_document_versions")
      .update({
        extracted_text: text,
        extraction_status: "extracted",
        processing_status: validation.requires_review ? "review_required" : "processed",
        validation_report: validation,
      })
      .eq("id", versionId);
    await db
      .from("knowledge_admin_documents")
      .update({ status: validation.requires_review ? "review_required" : "processed" })
      .eq("id", version.document_id);
    await finishJob(jobId, "completed", validation);
    return validation;
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
    .select("*,knowledge_admin_documents(id,title,source_label,document_kind)")
    .eq("id", versionId)
    .single();
  if (error || !version) throw new Error("No se encontró la versión.");
  const text = normalizeText(String(version.extracted_text || ""));
  if (text.length < 80) throw new Error("Procesa el documento antes de publicarlo.");

  const jobId = await createJob({ documentId: version.document_id as string, versionId, jobType: "publish", userId });
  try {
    const chunks = splitDocument(text);
    if (!chunks.length) throw new Error("No hay fragmentos válidos para publicar.");
    const report = buildValidationReport({ text, chunks, unitNumber: version.unit_number as number | null });
    const sourceLabel = String((version.knowledge_admin_documents as { source_label?: string })?.source_label || "Documento académico FATESCIPOL");
    const title = String((version.knowledge_admin_documents as { title?: string })?.title || version.original_filename || "Documento académico");
    const { data: academicDocument, error: academicError } = await db
      .from("academic_documents")
      .insert({
        title,
        source: sourceLabel,
        document_version: String(version.version_label || "v1"),
        schema_version: "MKF-1.0",
        source_hash: sha256(text),
        status: report.requires_review ? "REVIEW_REQUIRED" : "PROCESSED",
        report,
        active: true,
      })
      .select("id")
      .single();
    if (academicError || !academicDocument)
      throw new Error(academicError?.message || "No se pudo crear el documento académico MKF-1.");

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
          unit_name: unitName(version.unit_number as number) || `Unidad ${version.unit_number}`,
          status: report.requires_review ? "REVIEW_REQUIRED" : "PROCESSED",
          hierarchy: { unit_number: version.unit_number, unit_name: unitName(version.unit_number as number) },
          validation: report,
          source_hash: sha256(`${version.unit_number}\n${text}`),
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
          unit_name: "Documento general en revisión",
          status: "REVIEW_REQUIRED",
          hierarchy: { unit_number: null, unit_name: "Documento general" },
          validation: { ...report, requires_review: true },
          source_hash: sha256(text),
        })
        .select("id")
        .single();
      if (academicUnitError || !academicUnit)
        throw new Error(academicUnitError?.message || "No se pudo crear unidad general.");
      academicUnitId = academicUnit.id as string;
    }

    const topicMap = new Map<string, string>();
    for (const [index, chunk] of chunks.entries()) {
      const name = topicTitle(version, chunk);
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
              unit_name: unitName(version.unit_number as number) || null,
              topic_number: number,
              topic_name: name,
            },
            validation: { source_preserved: true },
            source_hash: sha256(`${number || ""}\n${name}`),
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
        unit_name: unitName(version.unit_number as number) || null,
        topic_number: number,
        topic_name: name,
        section_number: chunk.section,
        section_name: chunk.section_name,
      };
      const keywords = Array.from(
        new Set(
          [name, chunk.topic, chunk.section_name]
            .filter(Boolean)
            .flatMap((item) => String(item).split(/\s+/))
            .map((item) => item.toLowerCase().replace(/[^a-záéíóúñ0-9]/gi, ""))
            .filter((item) => item.length > 3)
            .slice(0, 18),
        ),
      );
      const objectHash = sha256(chunk.content);
      const { error: objectError } = await db.from("knowledge_objects").insert({
        id: objectId,
        academic_document_id: academicDocument.id,
        academic_unit_id: academicUnitId,
        academic_topic_id: topicId,
        concept: name,
        title: name,
        content_type: chunk.section_name ? "SOURCE_NOTE" : "OTHER",
        source_content: chunk.content,
        source_scope: "OFFICIAL_SOURCE",
        hierarchy,
        retrieval_metadata: { keywords, aliases: [], related_concepts: [], search_terms: keywords },
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
          learning_objectives: [],
          prerequisites: [],
          common_confusions: [],
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
          classification_confidence: chunk.section_name ? 0.72 : 0.55,
          hierarchy_confidence: chunk.section ? 0.74 : 0.6,
          requires_review: !chunk.section_name,
          warnings: chunk.section_name ? [] : ["Clasificación automática básica; requiere revisión académica."],
        },
        source_hash: objectHash,
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
        content: chunk.content,
        normalized_content: chunk.content.toLowerCase().replace(/\s+/g, " "),
        source_text: chunk.content,
        source_reference: sourceLabel,
        page_reference: chunk.page ? String(chunk.page) : null,
        token_count: Math.ceil(chunk.content.length / 4),
        embedding_hash: objectHash,
        keywords,
        metadata: hierarchy,
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
