import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { KnowledgeSearchPanel } from "@/components/knowledge/knowledge-search-panel";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminKnowledgeRagTestPage() {
  const profile = await requireAdmin();
  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">VALIDACIÓN RAG</span>
          <h1>Prueba de recuperación<span className="heading-dot">.</span></h1>
          <p>Consulta el conocimiento publicado para revisar fuentes, puntuaciones y contexto antes de usarlo en tutor, clase o simulacro.</p>
        </div>
        <Link className="button secondary" href="/admin/knowledge">Centro de conocimiento</Link>
      </div>
      <section className="panel admin-section">
        <KnowledgeSearchPanel />
      </section>
    </AppShell>
  );
}
