import { ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AssessmentPracticePanel } from "@/components/assessment/assessment-practice-panel";
import { requireStudent } from "@/lib/auth/session";
import { getAssessmentCatalog } from "@/lib/assessment/session-service";

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  const profile = await requireStudent();
  const params = await searchParams;
  const catalog = await getAssessmentCatalog();
  return (
    <AppShell profile={profile} active="practice">
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVALUACIÓN FORMATIVA</span>
          <h1>Práctica académica<span className="heading-dot">.</span></h1>
          <p>Genera preguntas desde el compendio, responde y recibe retroalimentación inmediata.</p>
        </div>
        <span className="badge"><ClipboardCheck size={15} /> Sprint 7</span>
      </div>
      <AssessmentPracticePanel units={catalog.units} topics={catalog.topics} initialUnit={Number(params.unit) || 1} />
    </AppShell>
  );
}
