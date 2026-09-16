import { BookOpen } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TutorForm } from "@/components/tutor-form";
import { requireStudent } from "@/lib/auth/session";
import { getUnitByNumber } from "@/lib/data";

export default async function TutorPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; section?: string }>;
}) {
  const profile = await requireStudent();
  const params = await searchParams;
  const unitNumber = Math.min(15, Math.max(1, Number(params.unit) || 1));
  const unit = await getUnitByNumber(unitNumber);
  const section = params.section?.slice(0, 180);
  return (
    <AppShell profile={profile} active="tutor">
      <div className="page-heading">
        <div>
          <span className="eyebrow">TUTOR IA · RAG POR UNIDAD</span>
          <h1>
            Tutor IA<span className="heading-dot">.</span>
          </h1>
          <p>
            Pregunta sobre Unidad {unit.number}, {unit.name}. El tutor filtra el
            compendio por unidad y prioriza el tema seleccionado.
          </p>
        </div>
        <span className="badge">
          <BookOpen size={15} /> Unidad {unit.number}
        </span>
      </div>
      <TutorForm unit={unit} section={section} />
    </AppShell>
  );
}
