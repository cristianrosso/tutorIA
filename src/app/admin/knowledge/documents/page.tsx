import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { KnowledgeUploadForm } from "@/components/admin/knowledge-management";
import { requireAdmin } from "@/lib/auth/session";
import { listKnowledgeDocuments } from "@/lib/admin/knowledge-management";

function statusLabel(value: unknown) {
  const labels: Record<string, string> = {
    uploaded: "Cargado",
    processing: "Procesando",
    processed: "Procesado",
    review_required: "Revisión requerida",
    published: "Publicado",
    failed: "Error",
    archived: "Archivado",
  };
  return labels[String(value)] || String(value || "Sin estado");
}

export default async function AdminKnowledgeDocumentsPage() {
  const profile = await requireAdmin();
  const data = await listKnowledgeDocuments();
  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">BIBLIOTECA ACADÉMICA</span>
          <h1>Documentos y versiones<span className="heading-dot">.</span></h1>
          <p>Carga fuentes, revisa versiones y publica conocimiento al RAG con rollback disponible.</p>
        </div>
        <Link className="button secondary" href="/admin/knowledge">Centro de conocimiento</Link>
      </div>
      {data.migrationMissing && <p className="notice error">Falta aplicar la migración {data.migrationName} en Supabase.</p>}
      <section className="panel admin-section">
        <div className="section-heading"><h2>Nueva fuente</h2><span>El archivo se almacena privado y se procesa bajo demanda</span></div>
        <KnowledgeUploadForm />
      </section>
      <section className="panel admin-section">
        <div className="section-heading"><h2>Catálogo</h2><span>{data.documents.length} documentos</span></div>
        <div className="admin-table knowledge-table">
          <div className="admin-table-row header"><span>Documento</span><span>Tipo</span><span>Estado</span><span>Versiones</span><span>Acciones</span></div>
          {data.documents.map((doc) => {
            const versions = Array.isArray(doc.knowledge_document_versions) ? doc.knowledge_document_versions : [];
            return (
              <div className="admin-table-row" key={String(doc.id)}>
                <span><strong>{String(doc.title)}</strong><small>{String(doc.description || doc.source_label || "Sin descripción")}</small></span>
                <span>{String(doc.document_kind || "-")}</span>
                <span>{statusLabel(doc.status)}</span>
                <span>{versions.length}</span>
                <span className="table-actions"><Link className="button secondary" href={`/admin/knowledge/documents/${doc.id}`}>Gestionar</Link></span>
              </div>
            );
          })}
          {!data.documents.length && <div className="admin-table-row"><span>No hay documentos todavía.</span><span></span><span></span><span></span><span></span></div>}
        </div>
      </section>
    </AppShell>
  );
}
