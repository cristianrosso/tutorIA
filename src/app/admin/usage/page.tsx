import Link from "next/link";
import { AlertTriangle, BarChart3, Coins, Cpu, Mic, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { EconomicSettingsForm } from "@/components/economic-settings-form";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStudentUsageSummary } from "@/lib/billing/ai-usage";
import { getEconomicSettings } from "@/lib/billing/economic-settings";

function money(value: number) {
  return `Bs ${value.toFixed(2)}`;
}

function secondsLabel(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  return `${(seconds / 60).toFixed(1)} min`;
}

function operationLabel(value: string) {
  const labels: Record<string, string> = {
    tutor_chat: "Tutor escrito",
    guided_class: "Modo clase",
    guided_class_feedback: "Feedback de clase",
    evaluation: "Evaluación",
    simulation: "Simulacro",
    stt: "Transcripción",
    tts: "Lectura por voz",
    embedding: "Embeddings",
    other: "Otros",
  };
  return labels[value] || value;
}

export default async function AdminUsagePage() {
  const profile = await requireAdmin();
  const [usage, profilesResult, settings] = await Promise.all([
    getStudentUsageSummary(),
    createSupabaseAdmin()
      .from("profiles")
      .select("id,username,full_name,status")
      .eq("role", "ESTUDIANTE")
      .order("full_name"),
    getEconomicSettings(),
  ]);
  const profiles = new Map(
    (profilesResult.data || []).map((item) => [item.id, item]),
  );

  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">SPRINT 21 · COSTOS</span>
          <h1>
            Consumo tecnológico<span className="heading-dot">.</span>
          </h1>
          <p>
            Costos observados, proyección del periodo y alertas administrativas.
            Las cifras son estimaciones operativas, no facturas definitivas del proveedor.
          </p>
        </div>
        <span className="badge">
          <Coins size={15} /> {money(usage.totals.costBob)}
        </span>
      </div>

      <div className="metrics-grid compact-metrics">
        <article className="metric-card">
          <BarChart3 size={20} />
          <span>Operaciones IA</span>
          <strong>{usage.totals.operations}</strong>
          <small>Periodo observado de {usage.totals.licenseDurationDays} días</small>
        </article>
        <article className="metric-card">
          <Coins size={20} />
          <span>Costo directo IA</span>
          <strong>{money(usage.totals.directCostBob)}</strong>
          <small>USD {usage.totals.costUsd.toFixed(4)} · tasa {usage.totals.usdToBob}</small>
        </article>
        <article className="metric-card">
          <Mic size={20} />
          <span>Voz</span>
          <strong>{money(usage.totals.voiceCostBob)}</strong>
          <small>STT + TTS registrado</small>
        </article>
        <article className="metric-card">
          <TrendingUp size={20} />
          <span>Proyección periodo</span>
          <strong>{money(usage.totals.projectedPeriodCostBob)}</strong>
          <small>Basada en {usage.totals.observedDays} día(s) con datos</small>
        </article>
        <article className="metric-card">
          <AlertTriangle size={20} />
          <span>Alertas</span>
          <strong>{usage.alerts.length}</strong>
          <small>Umbrales {usage.totals.alertThresholds.join(" / ")}%</small>
        </article>
        <article className="metric-card">
          <Cpu size={20} />
          <span>400 estudiantes</span>
          <strong>{money(usage.totals.projectedAllStudentsBob)}</strong>
          <small>Presupuesto objetivo {money(usage.totals.aggregateBudgetBob)}</small>
        </article>
      </div>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Configuración económica operativa</h2>
          <span>Aplica a nuevas estimaciones; no modifica históricos</span>
        </div>
        <EconomicSettingsForm settings={settings} />
      </section>

      {usage.alerts.length ? (
        <section className="panel admin-section">
          <div className="section-heading">
            <h2>Alertas presupuestarias</h2>
            <span>No suspenden automáticamente al estudiante</span>
          </div>
          <div className="admin-table two-col-table">
            <div className="admin-table-row header">
              <span>Estudiante</span>
              <span>Situación</span>
            </div>
            {usage.alerts.slice(0, 8).map((alert) => {
              const info = profiles.get(alert.userId);
              return (
                <div className="admin-table-row" key={alert.userId}>
                  <span>
                    <strong>{info?.full_name || "Estudiante"}</strong>
                    <small>@{info?.username || alert.userId.slice(0, 8)}</small>
                  </span>
                  <span>
                    {alert.currentPercent}% usado · proyección {alert.projectedPercent}%
                    <small>Severidad: {alert.severity}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="notice success">Sin alertas presupuestarias con los datos actuales.</p>
      )}

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Costo por funcionalidad</h2>
          <span>Identifica qué módulos generan más consumo</span>
        </div>
        <div className="usage-table usage-table-compact">
          <div className="usage-row header">
            <span>Función</span>
            <span>Operaciones</span>
            <span>Tokens</span>
            <span>Audio</span>
            <span>Costo</span>
          </div>
          {usage.breakdown.byOperation.length ? (
            usage.breakdown.byOperation.map((item) => (
              <div className="usage-row" key={item.key}>
                <span><strong>{operationLabel(item.key)}</strong><small>{item.key}</small></span>
                <span>{item.operations}</span>
                <span>{item.inputTokens + item.outputTokens}</span>
                <span>{secondsLabel(item.audioInputSeconds + item.audioOutputSeconds)}</span>
                <span>{money(item.costBob)}<small>USD {item.costUsd.toFixed(4)}</small></span>
              </div>
            ))
          ) : (
            <p className="notice">Aún no hay consumo IA registrado.</p>
          )}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Costo por modelo</h2>
          <span>Tarifas versionadas: {usage.totals.pricingVersion}</span>
        </div>
        <div className="usage-table usage-table-compact">
          <div className="usage-row header">
            <span>Modelo</span>
            <span>Operaciones</span>
            <span>Entrada</span>
            <span>Salida</span>
            <span>Costo</span>
          </div>
          {usage.breakdown.byModel.length ? (
            usage.breakdown.byModel.map((item) => (
              <div className="usage-row" key={item.key}>
                <span><strong>{item.key}</strong></span>
                <span>{item.operations}</span>
                <span>{item.inputTokens}<small>cache {item.cachedInputTokens}</small></span>
                <span>{item.outputTokens}</span>
                <span>{money(item.costBob)}</span>
              </div>
            ))
          ) : (
            <p className="notice">Sin modelos registrados todavía.</p>
          )}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Detalle por estudiante</h2>
          <span>Presupuesto objetivo: {money(usage.totals.budgetBob)} por periodo</span>
        </div>
        <div className="usage-table">
          <div className="usage-row header">
            <span>Estudiante</span>
            <span>Operaciones</span>
            <span>Tokens</span>
            <span>Modelos</span>
            <span>Costo periodo</span>
            <span>Presupuesto</span>
          </div>
          {usage.students.length ? (
            usage.students.map((student) => {
              const info = profiles.get(student.userId);
              return (
                <div className="usage-row" key={student.userId}>
                  <span>
                    <strong>{info?.full_name || "Estudiante"}</strong>
                    <small>@{info?.username || student.userId.slice(0, 8)}</small>
                  </span>
                  <span>{student.operations}</span>
                  <span>{student.inputTokens + student.outputTokens}</span>
                  <span>{student.models.join(", ") || "—"}</span>
                  <span>
                    {money(student.totalTechnologyCostBob)}
                    <small>IA {money(student.directCostBob)} · voz {money(student.voiceCostBob)}</small>
                  </span>
                  <span>
                    {student.budgetPercent}%
                    {student.threshold ? (
                      <small className="usage-warning">Umbral {student.threshold}%</small>
                    ) : (
                      <small>Proy. {student.projectedBudgetPercent}%</small>
                    )}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="notice">
              Aún no hay consumo IA registrado en la tabla detallada.
            </p>
          )}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Catálogo de tarifas efectivo</h2>
          <span>Configurable por variables de entorno; no altera operaciones pasadas</span>
        </div>
        <div className="admin-table">
          <div className="admin-table-row header">
            <span>Modelo</span>
            <span>Entrada</span>
            <span>Salida</span>
            <span>Audio</span>
            <span>Versión</span>
          </div>
          {usage.pricingCatalog.map((item) => (
            <div className="admin-table-row" key={item.model}>
              <span><strong>{item.model}</strong></span>
              <span>
                {item.inputPerMillionTokens ?? item.embeddingPerMillionTokens ?? 0}/1M
                <small>Cache {item.cachedInputPerMillionTokens ?? "—"}</small>
              </span>
              <span>{item.outputPerMillionTokens ?? "—"}/1M</span>
              <span>
                STT {item.audioInputPerMinute ?? "—"}/min
                <small>TTS {item.audioOutputPerMinute ?? item.audioOutputPerMillionCharacters ?? "—"}</small>
              </span>
              <span>{item.pricingVersion}</span>
            </div>
          ))}
        </div>
      </section>

      <p className="notice">
        Las proyecciones distinguen datos observados y estimaciones. Un día de uso alto no debe interpretarse como patrón definitivo de los {usage.totals.licenseDurationDays} días sin revisar el contexto académico y la cantidad de estudiantes activos.
      </p>

      <Link className="button secondary" href="/admin">
        Volver al panel de administración
      </Link>
    </AppShell>
  );
}
