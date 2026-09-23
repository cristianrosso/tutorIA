import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { KnowledgeVersionActions } from "@/components/admin/knowledge-management";
import { requireAdmin } from "@/lib/auth/session";
import { getKnowledgeDocumentDetail } from "@/lib/admin/knowledge-management";

function statusLabel(value: unknown) {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    extracted: "Extraído",
    processing: "Procesando",
    processed: "Procesado",
    review_required: "Revisión requerida",
    published: "Publicado",
    failed: "Error",
    rolled_back: "Revertido",
    uploaded: "Cargado",
  };
  return labels[String(value)] || String(value || "Sin estado");
}

function jsonBlock(value: unknown) {
  return JSON.stringify(value || {}, null, 2);
}

function localDate(value: unknown) {
  return value ? new Date(String(value)).toLocaleString("es-BO", { timeZone: "America/La_Paz" }) : "Sin fecha";
}

export default async function AdminKnowledgeDocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireAdmin();
  const { id } = await params;
  const detail = await getKnowledgeDocumentDetail(id);
  if (!detail) notFound();
  const document = detail.document;

  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">DOCUMENTO ACADÉMICO</span>
          <h1>{String(document.title)}<span className="heading-dot">.</span></h1>
          <p>{String(document.description || document.source_label || "Gestión avanzada de conocimiento académico.")}</p>
        </div>
        <Link className="button secondary" href="/admin/knowledge/documents">Volver</Link>
      </div>

      <div className="metrics-grid compact-metrics admin-metrics-grid">
        <article className="metric-card"><span>Estado</span><strong>{statusLabel(document.status)}</strong><small>Flujo editorial</small></article>
        <article className="metric-card"><span>Versiones</span><strong>{detail.versions.length}</strong><small>Archivos fuente</small></article>
        <article className="metric-card"><span>Trabajos</span><strong>{detail.jobs.length}</strong><small>Extracción y publicación</small></article>
        <article className="metric-card"><span>Publicaciones</span><strong>{detail.publications.length}</strong><small>Historial RAG</small></article>
      </div>

      <section className="panel admin-section">
        <div className="section-heading"><h2>Versiones</h2><span>Procesa, publica o revierte por versión</span></div>
        <div className="knowledge-version-list">
          {detail.versions.map((version) => (
            <article className="knowledge-version-card" key={String(version.id)}>
              <div>
                <strong>{String(version.version_label)} · {String(version.original_filename)}</strong>
                <span>{statusLabel(version.processing_status)} · extracción: {statusLabel(version.extraction_status)}</span>
                <small>
                  Unidad {String(version.unit_number || "general")} · Tema {String(version.topic_number || "sin tema")} · {Number(version.file_size_bytes || 0).toLocaleString("es-BO")} bytes
                </small>
              </div>
              <KnowledgeVersionActions
                versionId={String(version.id)}
                documentId={String(document.id)}
                status={String(version.processing_status)}
                hasAcademicDocument={Boolean(version.academic_document_id)}
              />
              <details className="ingestion-report">
                <summary>Ver validación</summary>
                <pre>{jsonBlock(version.validation_report)}</pre>
              </details>
            </article>
          ))}
          {!detail.versions.length && <p className="notice">No hay versiones cargadas para este documento.</p>}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading"><h2>Trabajos recientes</h2><span>Auditoría técnica del pipeline</span></div>
        <div className="admin-table audit-table">
          <div className="admin-table-row header"><span>Fecha</span><span>Tipo</span><span>Estado</span><span>Reporte</span></div>
          {detail.jobs.map((job) => (
            <div className="admin-table-row" key={String(job.id)}>
              <span>{localDate(job.created_at)}</span>
              <span>{String(job.job_type)}</span>
              <span>{statusLabel(job.status)}</span>
              <span><code>{String(job.error_message || "Sin errores")}</code></span>
            </div>
          ))}
          {!detail.jobs.length && <div className="admin-table-row"><span>No hay trabajos registrados.</span><span></span><span></span><span></span></div>}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading"><h2>Publicaciones</h2><span>Historial y rollback</span></div>
        <div className="history-list">
          {detail.publications.map((item) => (
            <article className="history-card" key={String(item.id)}>
              <div>•</div>
              <div>
                <strong>{statusLabel(item.status)} · {localDate(item.published_at)}</strong>
                <span>Documento académico: {String(item.academic_document_id || "sin vínculo")}</span>
                <p>{String(item.notes || "Sin notas")}</p>
              </div>
            </article>
          ))}
          {!detail.publications.length && <p className="notice">Aún no hay publicaciones para esta fuente.</p>}
        </div>
      </section>
    </AppShell>
  );
}
