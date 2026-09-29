import { FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ExamSimulatorPanel } from "@/components/exams/exam-simulator-panel";
import { StudentCourseSwitcher } from "@/components/student-course-switcher";
import { requireStudent } from "@/lib/auth/session";
import { getAssessmentCatalog } from "@/lib/assessment/session-service";
import { getStudentProductContext } from "@/lib/products/selection";

export default async function SimulacroPage({ searchParams }: { searchParams: Promise<{ unit?: string; product?: string }> }) {
  const profile = await requireStudent();
  const params = await searchParams;
  const productContext = await getStudentProductContext(profile, params.product);
  const catalog = await getAssessmentCatalog(productContext.activeProduct.id);
  return (
    <AppShell profile={profile} active="simulacro">
      <StudentCourseSwitcher
        products={productContext.products}
        activeProduct={productContext.activeProduct}
        basePath="/simulacro"
      />
      <div className="page-heading">
        <div>
          <span className="eyebrow">SPRINT 8 · SIMULADOR ESCRITO</span>
          <h1>Simulacro<span className="heading-dot">.</span></h1>
          <p>Practica un examen del curso {productContext.activeProduct.short_name} con tiempo, guardado de respuestas y retroalimentación académica al finalizar.</p>
        </div>
        <span className="badge"><FileText size={15} /> Evaluación integral</span>
      </div>
      <ExamSimulatorPanel
        units={catalog.units}
        topics={catalog.topics}
        initialUnit={Math.max(1, Number(params.unit) || 1)}
        productId={productContext.activeProduct.id}
        productSlug={productContext.activeProduct.slug}
      />
    </AppShell>
  );
}
