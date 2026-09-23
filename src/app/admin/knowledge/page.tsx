import { BookOpenCheck, Database, FileText, SearchCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { KnowledgeUploadForm } from "@/components/admin/knowledge-management";
import { requireAdmin } from "@/lib/auth/session";
import { listKnowledgeDocuments } from "@/lib/admin/knowledge-management";

function statusLabel(value: unknown) {
  const labels: Record<string, string> = {
    draft: "Borrador",
    uploaded: "Cargado",
    processing: "Procesando",
    processed: "Procesado",
    review_required: "Revisión requerida",
    published: "Publicado",
    archived: "Archivado",
    failed: "Error",
  };
  return labels[String(value)] || String(value || "Sin estado");
}

export default async function AdminKnowledgePage() {
  const profile = await requireAdmin();
  const data = await listKnowledgeDocuments();
  const modules = [
    {
      href: "/admin/knowledge/documents",
      title: "Documentos académicos",
      description: "Cargar, versionar, procesar, publicar y revertir fuentes.",
      icon: FileText,
    },
    {
      href: "/admin/knowledge/rag-test",
      title: "Prueba RAG",
      description: "Verificar recuperación, trazabilidad y fuentes antes de publicar cambios.",
      icon: SearchCheck,
    },
    {
      href: "/admin/knowledge/search",
      title: "Diagnóstico MKF-1",
      description: "Panel técnico heredado del Sprint 5B para inspección detallada.",
      icon: Database,
    },
  ];

  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading admin-hero">
        <div>
          <span className="eyebrow">SPRINT 18 · CONOCIMIENTO ACADÉMICO</span>
          <h1>Centro de conocimiento<span className="heading-dot">.</span></h1>
          <p>
            Administra fuentes académicas por versión, procesa texto oficial sin reescribirlo y publica al RAG solo después de revisión.
          </p>
        </div>
        <span className="badge"><ShieldCheck size={15} /> Admin</span>
      </div>

      {data.migrationMissing && (
        <p className="notice error">
          Falta aplicar la migración de Sprint 18 en Supabase. Copia y ejecuta <strong>{data.migrationName}</strong> en SQL Editor.
        </p>
      )}

      <div className="metrics-grid compact-metrics admin-metrics-grid">
        <article className="metric-card"><BookOpenCheck size={18} /><span>Documentos</span><strong>{data.totals.documents}</strong><small>Catálogo académico</small></article>
        <article className="metric-card"><FileText size={18} /><span>Versiones</span><strong>{data.totals.versions}</strong><small>Archivos cargados</small></article>
        <article className="metric-card"><Database size={18} /><span>Publicados</span><strong>{data.totals.published}</strong><small>Activos en RAG</small></article>
        <article className="metric-card"><SearchCheck size={18} /><span>Revisión</span><strong>{data.totals.reviewRequired}</strong><small>Requieren validación</small></article>
      </div>

      <section className="panel admin-section">
        <div className="section-heading"><h2>Módulos de conocimiento</h2><span>Flujo seguro de staging, revisión y publicación</span></div>
        <div className="admin-module-grid">
          {modules.map((module) => (
            <Link className="admin-module-card" href={module.href} key={module.href}>
              <module.icon size={22} />
              <strong>{module.title}</strong>
              <span>{module.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading"><h2>Cargar nuevo documento</h2><span>PDF, DOCX o TXT · almacenamiento privado</span></div>
        <KnowledgeUploadForm />
      </section>

      <section className="panel admin-section">
        <div className="section-heading"><h2>Últimos documentos</h2><span>Estado editorial y de publicación</span></div>
        <div className="admin-table knowledge-table">
          <div className="admin-table-row header"><span>Documento</span><span>Estado</span><span>Versiones</span><span>Actualizado</span><span>Acciones</span></div>
          {data.documents.length ? data.documents.slice(0, 8).map((doc) => {
            const versions = Array.isArray(doc.knowledge_document_versions) ? doc.knowledge_document_versions : [];
            return (
              <div className="admin-table-row" key={String(doc.id)}>
                <span><strong>{String(doc.title)}</strong><small>{String(doc.source_label || "Sin fuente")}</small></span>
                <span>{statusLabel(doc.status)}</span>
                <span>{versions.length}</span>
                <span>{doc.updated_at ? new Date(String(doc.updated_at)).toLocaleString("es-BO", { timeZone: "America/La_Paz" }) : "Sin fecha"}</span>
                <span className="table-actions"><Link className="button secondary" href={`/admin/knowledge/documents/${doc.id}`}>Abrir</Link></span>
              </div>
            );
          }) : (
            <div className="admin-table-row"><span>Aún no hay documentos cargados.</span><span></span><span></span><span></span><span></span></div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
