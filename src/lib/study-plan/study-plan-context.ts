import "server-only";
import { getCurrentStudyPlan } from "@/lib/study-plan/study-plan-service";

export async function buildStudyPlanContext(userId: string) {
  const current = await getCurrentStudyPlan(userId).catch(() => null);
  if (!current)
    return "El estudiante no tiene un plan de estudio activo o borrador.";
  const today = current.summary.todayActivities
    .slice(0, 5)
    .map(
      (activity) =>
        `- ${activity.title}: ${activity.estimated_minutes} minutos, estado ${activity.status}.`,
    )
    .join("\n");
  return `Plan de estudio: ${current.plan.title}. Estado: ${current.plan.status}. Examen: ${current.plan.exam_date}. Actividades programadas: ${current.summary.scheduledActivities}. Completadas: ${current.summary.completedActivities}. Pendientes: ${current.summary.pendingActivities}. Estudio de hoy:\n${today || "Sin actividades programadas para hoy."}`;
}
