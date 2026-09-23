"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import {
  processKnowledgeVersion,
  publishKnowledgeVersion,
  rollbackKnowledgeVersion,
  uploadKnowledgeDocument,
} from "@/lib/admin/knowledge-management";

function fail(error: unknown) {
  return {
    ok: false,
    message:
      error instanceof Error
        ? error.message
        : "No se pudo completar la operación de conocimiento.",
  };
}

function revalidateKnowledge(documentId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/knowledge");
  revalidatePath("/admin/knowledge/documents");
  revalidatePath("/admin/knowledge/rag-test");
  revalidatePath("/admin/knowledge/search");
  if (documentId) revalidatePath(`/admin/knowledge/documents/${documentId}`);
}

export async function uploadKnowledgeDocumentAction(_state: unknown, form: FormData) {
  try {
    const profile = await requireAdmin();
    const result = await uploadKnowledgeDocument(form, profile.id);
    revalidateKnowledge(result.documentId);
    return {
      ok: true,
      message: "Documento cargado. Ahora puedes procesar la versión.",
      documentId: result.documentId,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function processKnowledgeVersionAction(_state: unknown, form: FormData) {
  try {
    const profile = await requireAdmin();
    const versionId = z.uuid().parse(form.get("versionId"));
    const documentId = z.uuid().optional().parse(form.get("documentId") || undefined);
    const report = await processKnowledgeVersion(versionId, profile.id);
    revalidateKnowledge(documentId);
    return { ok: true, message: `Procesado: ${report.chunks} fragmentos generados.` };
  } catch (error) {
    return fail(error);
  }
}

export async function publishKnowledgeVersionAction(_state: unknown, form: FormData) {
  try {
    const profile = await requireAdmin();
    const versionId = z.uuid().parse(form.get("versionId"));
    const documentId = z.uuid().optional().parse(form.get("documentId") || undefined);
    const result = await publishKnowledgeVersion(versionId, profile.id);
    revalidateKnowledge(documentId);
    return {
      ok: true,
      message: `Publicado en RAG: ${result.report.chunks} fragmentos académicos disponibles.`,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function rollbackKnowledgeVersionAction(_state: unknown, form: FormData) {
  try {
    const profile = await requireAdmin();
    const versionId = z.uuid().parse(form.get("versionId"));
    const documentId = z.uuid().optional().parse(form.get("documentId") || undefined);
    await rollbackKnowledgeVersion(versionId, profile.id);
    revalidateKnowledge(documentId);
    return { ok: true, message: "Publicación revertida. El documento académico quedó inactivo." };
  } catch (error) {
    return fail(error);
  }
}
