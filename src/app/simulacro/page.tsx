import { FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ExamSimulatorPanel } from "@/components/exams/exam-simulator-panel";
import { requireStudent } from "@/lib/auth/session";
import { getAssessmentCatalog } from "@/lib/assessment/session-service";

export default async function SimulacroPage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  const profile = await requireStudent();
  const params = await searchParams;
  const catalog = await getAssessmentCatalog();
  return (
    <AppShell profile={profile} active="simulacro">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SPRINT 8 · SIMULADOR ESCRITO</span>
          <h1>Simulacro<span className="heading-dot">.</span></h1>
          <p>Practica un examen de grado con tiempo, guardado de respuestas y retroalimentación académica al finalizar.</p>
        </div>
        <span className="badge"><FileText size={15} /> Evaluación integral</span>
      </div>
      <ExamSimulatorPanel units={catalog.units} topics={catalog.topics} initialUnit={Number(params.unit) || 1} />
    </AppShell>
  );
}
