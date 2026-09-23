import Link from "next/link";
import { Activity, BarChart3, BookOpenCheck, ClipboardCheck, Download, GraduationCap, Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireStudent } from "@/lib/auth/session";
import { getStudentAnalytics } from "@/lib/analytics/learning-analytics";

export default async function StudentAnalyticsPage({ searchParams }: { searchParams?: Promise<{ period?: string }> }) {
  const profile = await requireStudent();
  const params = await searchParams;
  const period = params?.period === "7d" || params?.period === "30d" || params?.period === "all" ? params.period : "40d";
  const analytics = await getStudentAnalytics(profile.id, { period });
  return (
    <AppShell profile={profile} active="analytics">
      <div className="page-heading">
        <div>
          <span className="eyebrow">ANALÍTICA ACADÉMICA</span>
          <h1>Mi seguimiento<span className="heading-dot">.</span></h1>
          <p>Actividad, cobertura, evaluaciones, simulacros y temas de refuerzo calculados desde registros reales.</p>
        </div>
        <Link className="button secondary" href={`/api/student/analytics/export?period=${period}`}><Download size={16} /> CSV</Link>
      </div>

      <div className="filter-bar">
        {["7d", "30d", "40d", "all"].map((item) => (
          <Link className="button ghost" key={item} href={`/analitica?period=${item}`}>{item === "all" ? "Todo" : item}</Link>
        ))}
      </div>

      <div className="progress-summary">
        <MetricCard icon={Activity} label="Actividad" value={`${analytics.activity.events}`} detail={`${analytics.activity.daysWithActivity} días con actividad`} />
        <MetricCard icon={BookOpenCheck} label="Clases" value={`${analytics.activity.classesCompleted}/${analytics.activity.classesStarted}`} detail="Completadas / iniciadas" />
        <MetricCard icon={ClipboardCheck} label="Evaluaciones" value={analytics.assessments.observedAccuracy === null ? "Sin datos" : `${analytics.assessments.observedAccuracy}%`} detail={`${analytics.assessments.completed} completadas`} />
        <MetricCard icon={GraduationCap} label="Simulacros" value={analytics.simulations.observedAccuracy === null ? "Sin datos" : `${analytics.simulations.observedAccuracy}%`} detail={`${analytics.simulations.completed} completados`} />
      </div>

      <section className="panel">
        <div className="section-heading"><h2>Estados por unidad</h2><span>No equivale a dominio automático</span></div>
        <div className="admin-table">
          <div className="admin-table-row header"><span>Unidad</span><span>Actividad</span><span>Temas</span><span>Evaluaciones</span><span>Estado</span></div>
          {analytics.coverage.length ? analytics.coverage.map((unit) => {
            const state = analytics.states.find((item) => item.unitId === unit.unitId)?.state || "Sin evidencia suficiente";
            return <div className="admin-table-row" key={unit.unitId}><span>{unit.unitLabel}</span><span>{unit.events}</span><span>{unit.topicsWorked}</span><span>{unit.assessments}</span><span>{state}</span></div>;
          }) : <p className="notice">Sin actividad académica registrada todavía.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading"><h2>Temas para refuerzo</h2><span>Máximo 8 recomendaciones</span></div>
        {analytics.reinforcement.length ? (
          <ul className="recommendation-list">
            {analytics.reinforcement.map((item, index) => <li key={`${item.unitId}-${index}`}><Target size={17} /> <span><strong>{item.topicName}</strong><br />{item.unitLabel} · {item.reason} · {item.incorrectAnswers} errores</span></li>)}
          </ul>
        ) : <p className="notice">Sin datos suficientes para recomendar refuerzo académico.</p>}
      </section>

      <section className="panel">
        <div className="section-heading"><h2>Evolución observada</h2><span>Evaluaciones y simulacros completados</span></div>
        <div className="progress-summary">
          <MiniTrend title="Evaluaciones" rows={analytics.assessments.trend} />
          <MiniTrend title="Simulacros" rows={analytics.simulations.trend} />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading"><h2>Limitaciones</h2><span>Transparencia</span></div>
        <ul className="recommendation-list">{analytics.limitations.map((item) => <li key={item}><BarChart3 size={17} /> {item}</li>)}</ul>
      </section>
    </AppShell>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return <div className="panel"><Icon size={20} /><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function MiniTrend({ title, rows }: { title: string; rows: Array<{ id: unknown; date: unknown; percent: number | null; totalQuestions: number }> }) {
  return <div className="panel"><h3>{title}</h3>{rows.length ? rows.slice(-6).map((row) => <p key={String(row.id)} className="mini-row"><span>{String(row.date || "Sin fecha").slice(0, 10)}</span><strong>{row.percent === null ? "Sin puntaje" : `${row.percent}%`}</strong><small>{row.totalQuestions} preguntas</small></p>) : <p className="notice">Sin datos suficientes.</p>}</div>;
}
