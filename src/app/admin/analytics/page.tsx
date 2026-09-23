import { Activity, BarChart3, BookOpenCheck, ClipboardCheck, GraduationCap, Target } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminLearningAnalytics } from "@/lib/analytics/learning-analytics";

export default async function AdminAnalyticsPage({ searchParams }: { searchParams?: Promise<{ period?: string }> }) {
  const profile = await requireAdmin();
  const params = await searchParams;
  const period = params?.period === "7d" || params?.period === "30d" || params?.period === "all" ? params.period : "40d";
  const analytics = await getAdminLearningAnalytics({ period });
  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">SPRINT 19 · ANALÍTICA ACADÉMICA</span>
          <h1>Seguimiento académico<span className="heading-dot">.</span></h1>
          <p>Indicadores agregados de actividad, cobertura, evaluaciones, simulacros y refuerzo sin mostrar conversaciones privadas.</p>
        </div>
        <span className="badge"><BarChart3 size={15} /> {period === "all" ? "Todo" : period}</span>
      </div>

      <div className="progress-summary">
        <MetricCard icon={Activity} label="Estudiantes activos" value={`${analytics.summary.studentsWithActivity}/${analytics.summary.students}`} detail="Con algún registro en el periodo" />
        <MetricCard icon={ClipboardCheck} label="Evaluaciones" value={`${analytics.summary.assessmentsCompleted}`} detail={analytics.summary.assessmentAccuracy === null ? "Sin precisión observada" : `${analytics.summary.assessmentAccuracy}% promedio observado`} />
        <MetricCard icon={GraduationCap} label="Simulacros" value={`${analytics.summary.simulationsCompleted}`} detail={analytics.summary.simulationAccuracy === null ? "Sin precisión observada" : `${analytics.summary.simulationAccuracy}% promedio observado`} />
        <MetricCard icon={BookOpenCheck} label="Clases" value={`${analytics.summary.classesCompleted}`} detail="Sesiones completadas" />
      </div>

      <section className="panel admin-section">
        <div className="section-heading"><h2>Unidades con más actividad</h2><span>Actividad + práctica + evaluación</span></div>
        <div className="admin-table">
          <div className="admin-table-row header"><span>Unidad</span><span>Eventos</span><span>Temas</span><span>Evaluaciones</span><span>Errores</span></div>
          {analytics.units.length ? analytics.units.map((unit) => <div className="admin-table-row" key={unit.unitId}><span>{unit.unitLabel}</span><span>{unit.events}</span><span>{unit.topicsWorked}</span><span>{unit.assessments}</span><span>{unit.incorrectAnswers}</span></div>) : <p className="notice">Sin actividad académica agregada.</p>}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading"><h2>Refuerzo agregado</h2><span>No es ranking individual</span></div>
        {analytics.reinforcement.length ? <ul className="recommendation-list">{analytics.reinforcement.map((item) => <li key={item.unitId}><Target size={17} /> <span><strong>{item.unitLabel}</strong><br />{item.incorrectAnswers} errores · {item.reviewRecords} registros en revisión</span></li>)}</ul> : <p className="notice">Sin evidencia suficiente para refuerzo agregado.</p>}
      </section>

      <section className="panel admin-section">
        <div className="section-heading"><h2>Tipos de actividad</h2><span>Eventos académicos registrados</span></div>
        <div className="progress-summary">{analytics.activityTypes.slice(0, 6).map((item) => <div className="panel" key={item.label}><span>{item.label}</span><strong>{item.count}</strong></div>)}</div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading"><h2>Privacidad y límites</h2><span>Uso académico autorizado</span></div>
        <ul className="recommendation-list">{analytics.limitations.map((item) => <li key={item}><BarChart3 size={17} /> {item}</li>)}</ul>
      </section>
    </AppShell>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return <div className="panel"><Icon size={20} /><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}
