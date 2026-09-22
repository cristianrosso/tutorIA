import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { StudyPlanManager } from "@/components/study-plan/study-plan-manager";
import { requireStudent } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getCurrentStudyPlan } from "@/lib/study-plan/study-plan-service";

export default async function StudyPlanPage() {
  const profile = await requireStudent();
  const db = createSupabaseAdmin();
  const [{ data: units }, currentPlan] = await Promise.all([
    db
      .from("academic_units")
      .select("id,unit_number,unit_name")
      .order("unit_number"),
    getCurrentStudyPlan(profile.id),
  ]);
  return (
    <AppShell profile={profile} active="studyPlan">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SPRINT 10 · PLAN INTELIGENTE</span>
          <h1>
            Plan de estudio<span className="heading-dot">.</span>
          </h1>
          <p>
            Organiza tus unidades, repasos, prácticas y simulacros antes del
            examen.
          </p>
        </div>
      </div>
      <StudyPlanManager units={units || []} initialPlan={currentPlan} />
    </AppShell>
  );
}

export function StudentStudyPlanRedirect() {
  redirect("/plan-estudio");
}
