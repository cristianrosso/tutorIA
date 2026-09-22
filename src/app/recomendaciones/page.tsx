import Link from "next/link";
import { ArrowLeft, BrainCircuit, Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RecommendationsPanel } from "@/components/adaptive/recommendations-panel";
import { requireStudent } from "@/lib/auth/session";
import { getAdaptiveDashboard } from "@/lib/adaptive/recommendation-engine";

export default async function RecommendationsPage() {
  const profile = await requireStudent();
  const dashboard = await getAdaptiveDashboard(profile.id);
  const consolidated = dashboard.mastery.filter(
    (item) => item.masteryLevel === "CONSOLIDATED",
  ).length;
  const inProgress = dashboard.mastery.filter(
    (item) => item.masteryLevel === "DEVELOPING",
  ).length;
  const needsReview = dashboard.gaps.filter(
    (item) =>
      item.gapType === "OBSERVED_DIFFICULTY" ||
      item.gapType === "RECURRENT_DIFFICULTY",
  ).length;

  return (
    <AppShell profile={profile} active="recommendations">
      <div className="page-heading">
        <div>
          <span className="eyebrow">MOTOR ADAPTATIVO</span>
          <h1>
            Recomendaciones<span className="heading-dot">.</span>
          </h1>
          <p>
            El sistema analiza tus prácticas, evaluaciones y simulacros para
            sugerir el siguiente paso de estudio.
          </p>
        </div>
        <Link className="button ghost" href="/progreso">
          <ArrowLeft size={16} /> Volver a mi progreso
        </Link>
      </div>
      <div className="progress-summary">
        <div className="panel">
          <span>Temas consolidados</span>
          <strong>{consolidated}</strong>
          <small>Con evidencia suficiente y desempeño estable</small>
        </div>
        <div className="panel">
          <span>En desarrollo</span>
          <strong>{inProgress}</strong>
          <small>Temas con avance pero aún no consolidados</small>
        </div>
        <div className="panel">
          <span>Requieren refuerzo</span>
          <strong>{needsReview}</strong>
          <small>Dificultades observadas o recurrentes</small>
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>
            <BrainCircuit size={22} /> Plan adaptativo
          </h2>
          <span>Basado en evidencia real del estudiante</span>
        </div>
        <RecommendationsPanel
          initialRecommendations={dashboard.recommendations}
        />
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>
            <Target size={22} /> Brechas detectadas
          </h2>
          <span>Clasificación formativa</span>
        </div>
        {dashboard.gaps.length ? (
          <ul className="recommendation-list">
            {dashboard.gaps.slice(0, 8).map((gap) => (
              <li
                key={
                  gap.knowledgeObjectId ||
                  gap.topicId ||
                  gap.unitId ||
                  gap.reason
                }
              >
                <Target size={15} /> {gap.reason} Dominio estimado:{" "}
                {gap.estimate.masteryScore}%.
              </li>
            ))}
          </ul>
        ) : (
          <p className="notice">
            Todavía no se detectan brechas. Realiza prácticas o simulacros para
            generar evidencia.
          </p>
        )}
      </section>
    </AppShell>
  );
}
