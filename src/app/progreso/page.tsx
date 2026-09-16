import Link from "next/link";
import { Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth/session";
import { getStudentStats, getUnitsWithProgress } from "@/lib/data";

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    sin_iniciar: "Sin iniciar",
    en_estudio: "En estudio",
    practicando: "Practicando",
    buen_dominio: "Buen dominio",
    necesita_refuerzo: "Necesita refuerzo",
  };
  return labels[status || "sin_iniciar"] || "Sin iniciar";
}

export default async function ProgressPage() {
  const profile = await requireProfile();
  const [stats, units] = await Promise.all([
    getStudentStats(),
    getUnitsWithProgress(),
  ]);
  return (
    <AppShell profile={profile} active="progress">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PROGRESO ACADÉMICO</span>
          <h1>
            Mi progreso<span className="heading-dot">.</span>
          </h1>
          <p>
            Seguimiento formativo basado en preguntas, prácticas y simulacros.
          </p>
        </div>
      </div>
      <div className="progress-summary">
        <div className="panel">
          <span>Unidades estudiadas</span>
          <strong>{stats.unitsStudied} / 15</strong>
        </div>
        <div className="panel">
          <span>Simulacros realizados</span>
          <strong>{stats.simulations}</strong>
        </div>
        <div className="panel">
          <span>Preguntas practicadas</span>
          <strong>{stats.conversations + stats.practices}</strong>
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Temas que debes reforzar</h2>
          <span>Máximo 3 recomendaciones</span>
        </div>
        {stats.weakTopics.length ? (
          <ul className="recommendation-list">
            {stats.weakTopics.map((topic) => (
              <li key={topic}>
                <Target size={15} /> {topic}
              </li>
            ))}
          </ul>
        ) : (
          <p className="notice">
            Realiza tu primer simulacro para obtener recomendaciones
            personalizadas.
          </p>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Progreso por unidad</h2>
          <span>{units.length} unidades</span>
        </div>
        <div className="progress-unit-list">
          {units.map((unit) => (
            <Link href={`/unidad/${unit.number}`} key={unit.id}>
              <strong>
                {String(unit.number).padStart(2, "0")} · {unit.name}
              </strong>
              <span>
                {statusLabel(unit.status)} · {unit.progress}%
              </span>
              <div className="progress-bar">
                <span style={{ width: `${unit.progress}%` }} />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
