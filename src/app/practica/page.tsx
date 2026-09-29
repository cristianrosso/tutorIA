import { ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AssessmentPracticePanel } from "@/components/assessment/assessment-practice-panel";
import { StudentCourseSwitcher } from "@/components/student-course-switcher";
import { requireStudent } from "@/lib/auth/session";
import { getAssessmentCatalog } from "@/lib/assessment/session-service";
import { getStudentProductContext } from "@/lib/products/selection";

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ unit?: string; product?: string }> }) {
  const profile = await requireStudent();
  const params = await searchParams;
  const productContext = await getStudentProductContext(profile, params.product);
  const catalog = await getAssessmentCatalog(productContext.activeProduct.id);
  return (
    <AppShell profile={profile} active="practice">
      <StudentCourseSwitcher
        products={productContext.products}
        activeProduct={productContext.activeProduct}
        basePath="/practica"
      />
      <div className="page-heading">
        <div>
          <span className="eyebrow">EVALUACIÓN FORMATIVA</span>
          <h1>Práctica académica<span className="heading-dot">.</span></h1>
          <p>Genera preguntas desde el contenido del curso {productContext.activeProduct.short_name}, responde y recibe retroalimentación inmediata.</p>
        </div>
        <span className="badge"><ClipboardCheck size={15} /> Sprint 7</span>
      </div>
      <AssessmentPracticePanel
        units={catalog.units}
        topics={catalog.topics}
        initialUnit={Number(params.unit) || 1}
        productId={productContext.activeProduct.id}
        productSlug={productContext.activeProduct.slug}
      />
    </AppShell>
  );
}
