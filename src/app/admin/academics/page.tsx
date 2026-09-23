import { BookOpenCheck, GraduationCap, Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { getAdminAcademics } from "@/lib/admin/admin-service";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminAcademicsPage() {
  const profile = await requireAdmin();
  const data = await getAdminAcademics();

  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEGUIMIENTO ACADÉMICO</span>
          <h1>Actividad formativa.</h1>
          <p>
            Evidencias reales de tutor, práctica, simulacros, progreso y temas
            que requieren refuerzo.
          </p>
        </div>
      </div>

      <div className="metrics-grid compact-metrics">
        <article className="metric-card">
          <BookOpenCheck size={20} />
          <span>Eventos de aprendizaje</span>
          <strong>{data.events}</strong>
          <small>Interacciones académicas registradas</small>
        </article>
        <article className="metric-card">
          <Target size={20} />
          <span>Progreso por tema</span>
          <strong>{data.progressRecords}</strong>
          <small>Registros de memoria académica</small>
        </article>
        <article className="metric-card">
          <GraduationCap size={20} />
          <span>Prácticas</span>
          <strong>{data.assessments}</strong>
          <small>Sesiones formativas</small>
        </article>
        <article className="metric-card">
          <GraduationCap size={20} />
          <span>Simulacros</span>
          <strong>{data.exams}</strong>
          <small>Exámenes registrados</small>
        </article>
      </div>

      <div className="admin-detail-grid">
        <section className="panel admin-section">
          <h2>Unidades con mayor actividad</h2>
          {data.units.length ? (
            data.units.map((unit) => (
              <article className="mini-row" key={unit.name}>
                <strong>{unit.name}</strong>
                <span>{unit.count} registros</span>
              </article>
            ))
          ) : (
            <p className="notice">Aún no hay actividad académica suficiente.</p>
          )}
        </section>

        <section className="panel admin-section">
          <h2>Temas que requieren refuerzo</h2>
          {data.reinforcement.length ? (
            data.reinforcement.map((item, index) => (
              <article className="mini-row" key={index}>
                <strong>Registro {index + 1}</strong>
                <span>
                  {item.practice_attempts || 0} prácticas ·{" "}
                  {item.incorrect_answers || 0} errores observados
                </span>
              </article>
            ))
          ) : (
            <p className="notice">
              No hay suficientes errores registrados para priorizar refuerzos.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
