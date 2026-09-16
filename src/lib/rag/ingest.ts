import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { splitDocument, type ChunkInput } from "@/lib/rag/chunk";
import {
  buildIngestionReport,
  parseFullCompendium,
  type IngestionReport,
} from "@/lib/rag/full-compendium";
import { OFFICIAL_UNITS } from "@/lib/units";

export type IngestDocumentInput = {
  unitNumber: number;
  title: string;
  source: string;
  version: string;
  content: string;
};

export type FullCompendiumIngestInput = {
  title: string;
  source: string;
  version: string;
  content: string;
  originalFilename?: string;
};

function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function ingestDocument(input: IngestDocumentInput) {
  const chunks = splitDocument(input.content);
  if (chunks.length === 0)
    throw new Error("El texto no tiene contenido suficiente para fragmentar.");
  const report: IngestionReport = {
    detectedUnits: 1,
    expectedUnits: 1,
    units: [
      {
        unitNumber: input.unitNumber,
        unitName: "",
        sections: new Set(
          chunks.map((chunk) => chunk.section_name).filter(Boolean),
        ).size,
        chunks: chunks.length,
        words: input.content.split(/\s+/).filter(Boolean).length,
        pages: "sin página detectada",
        untitledChunks: chunks.filter((chunk) => !chunk.section_name).length,
        smallChunks: chunks.filter((chunk) => chunk.content.length < 250)
          .length,
        largeChunks: chunks.filter((chunk) => chunk.content.length > 1800)
          .length,
        issues: [],
      },
    ],
    anomalies: [],
  };
  return ingestUnitDocument({ ...input, chunks, report });
}

export async function ingestFullCompendium(input: FullCompendiumIngestInput) {
  const parsedUnits = parseFullCompendium(input.content);
  if (parsedUnits.length === 0) {
    throw new Error("No se detectaron unidades en el compendio.");
  }
  const report = buildIngestionReport(parsedUnits);
  const results = [] as Array<{
    unitNumber: number;
    documentId: string;
    chunks: number;
  }>;
  for (const unit of parsedUnits) {
    const result = await ingestUnitDocument({
      unitNumber: unit.unitNumber,
      title: `${input.title} · Unidad ${unit.unitNumber}`,
      source: input.source,
      version: input.version,
      content: unit.content,
      chunks: unit.chunks,
      report,
      originalFilename: input.originalFilename,
    });
    results.push({ unitNumber: unit.unitNumber, ...result });
  }
  await ensureOfficialUnitsEnabled();
  return { report, results };
}

async function ensureOfficialUnitsEnabled() {
  const db = createSupabaseAdmin();
  for (const unit of OFFICIAL_UNITS) {
    await db
      .from("units")
      .upsert(
        { number: unit.number, name: unit.name, enabled: true },
        { onConflict: "number" },
      );
  }
}

async function ingestUnitDocument(
  input: IngestDocumentInput & {
    chunks: ChunkInput[];
    report: IngestionReport;
    originalFilename?: string;
  },
) {
  const db = createSupabaseAdmin();
  await ensureOfficialUnitsEnabled();
  const { data: unit, error: unitError } = await db
    .from("units")
    .select("id,number,name")
    .eq("number", input.unitNumber)
    .single();
  if (unitError || !unit) throw new Error("No se encontró la unidad temática.");

  const contentHash = hashContent(`${input.version}\n${input.content}`);
  const { data: existing } = await db
    .from("documents")
    .select("id")
    .eq("unit_id", unit.id)
    .eq("content_hash", contentHash)
    .eq("status", "ready")
    .eq("active", true)
    .maybeSingle();
  if (existing?.id)
    return { documentId: existing.id as string, chunks: input.chunks.length };

  const { data: document, error: documentError } = await db
    .from("documents")
    .insert({
      unit_id: unit.id,
      title: input.title,
      source: input.source,
      version: input.version,
      status: "processing",
      active: false,
      content_hash: contentHash,
      ingestion_report: input.report,
      original_filename: input.originalFilename || null,
    })
    .select("id")
    .single();
  if (documentError || !document)
    throw new Error("No se pudo registrar el documento.");

  try {
    const rows = input.chunks.map((chunk, index) => ({
      document_id: document.id,
      chunk_index: index,
      content: chunk.content,
      section: chunk.section,
      section_name: chunk.section_name,
      section_number: chunk.section,
      section_title: chunk.section_name,
      topic: chunk.topic || chunk.section_name,
      page: chunk.page,
      page_start: chunk.page,
      page_end: chunk.page,
      unit_number: unit.number,
      unit_name: unit.name,
      metadata: {
        ...chunk.metadata,
        unit: unit.number,
        unit_name: unit.name,
        source: input.source,
        source_document: input.title,
      },
    }));
    const { error: chunkError } = await db.from("document_chunks").insert(rows);
    if (chunkError) throw chunkError;
    const { error: readyError } = await db
      .from("documents")
      .update({
        status: "ready",
        active: true,
        processed_at: new Date().toISOString(),
      })
      .eq("id", document.id);
    if (readyError) throw readyError;
    await db
      .from("documents")
      .update({ active: false, superseded_by: document.id })
      .eq("unit_id", unit.id)
      .neq("id", document.id)
      .eq("active", true);
    return { documentId: document.id as string, chunks: input.chunks.length };
  } catch (error) {
    await db
      .from("documents")
      .update({ status: "failed" })
      .eq("id", document.id);
    throw new Error(
      error instanceof Error
        ? error.message
        : "No se pudo completar la ingesta.",
    );
  }
}
