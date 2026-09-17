import { AppShell } from "@/components/app-shell";
import { KnowledgeSearchPanel } from "@/components/knowledge/knowledge-search-panel";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminKnowledgeSearchPage() {
  const profile = await requireAdmin();
  return (
    <AppShell profile={profile} active="admin">
      <div className="page-heading">
        <div>
          <span className="eyebrow">RAG ACADÉMICO MKF-1</span>
          <h1>
            Búsqueda de conocimiento<span className="heading-dot">.</span>
          </h1>
          <p>
            Diagnostica recuperación semántica, textual, académica, reranking y
            trazabilidad antes de conectar el motor al tutor final.
          </p>
        </div>
        <span className="badge">Sprint 5B</span>
      </div>
      <section className="panel admin-section">
        <KnowledgeSearchPanel />
      </section>
    </AppShell>
  );
}
