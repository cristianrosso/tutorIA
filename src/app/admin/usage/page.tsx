import Link from "next/link";
import { AlertTriangle, BarChart3, Coins } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EconomicSettingsForm } from "@/components/economic-settings-form";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getStudentUsageSummary } from "@/lib/billing/ai-usage";
import { getEconomicSettings } from "@/lib/billing/economic-settings";

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
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONSUMO IA</span>
          <h1>
            Uso y costos por estudiante<span className="heading-dot">.</span>
          </h1>
          <p>
            Registro individual de tokens, modelos y costo tecnológico estimado.
          </p>
        </div>
        <span className="badge">
          <Coins size={15} /> Bs {usage.totals.costBob.toFixed(2)}
        </span>
      </div>

      <div className="metrics-grid compact-metrics">
        <article className="metric-card">
          <BarChart3 size={20} />
          <span>Operaciones</span>
          <strong>{usage.totals.operations}</strong>
          <small>Total registrado</small>
        </article>
        <article className="metric-card">
          <Coins size={20} />
          <span>Costo acumulado</span>
          <strong>Bs {usage.totals.costBob.toFixed(2)}</strong>
          <small>USD {usage.totals.costUsd.toFixed(4)}</small>
        </article>
        <article className="metric-card">
          <AlertTriangle size={20} />
          <span>Presupuesto ref.</span>
          <strong>Bs {usage.totals.budgetBob}</strong>
          <small>Por estudiante · No es bloqueo automático</small>
        </article>
        <article className="metric-card">
          <Coins size={20} />
          <span>Proyección 400 estudiantes</span>
          <strong>
            Bs {usage.totals.projectedMonthlyBudgetBob.toFixed(0)}
          </strong>
          <small>{usage.totals.licenseDurationDays} días de acceso</small>
        </article>
      </div>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Configuración económica operativa</h2>
          <span>Aplicable a nuevas operaciones; no modifica históricos</span>
        </div>
        <EconomicSettingsForm settings={settings} />
      </section>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Detalle por estudiante</h2>
          <span>Tasa contable: {usage.totals.usdToBob} Bs/USD</span>
        </div>
        <div className="usage-table">
          <div className="usage-row header">
            <span>Estudiante</span>
            <span>Consultas</span>
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
                    <small>
                      @{info?.username || student.userId.slice(0, 8)}
                    </small>
                  </span>
                  <span>{student.operations}</span>
                  <span>{student.inputTokens + student.outputTokens}</span>
                  <span>{student.models.join(", ") || "—"}</span>
                  <span>
                    Bs {student.totalTechnologyCostBob.toFixed(2)}
                    <small>IA Bs {student.costBob.toFixed(2)}</small>
                  </span>
                  <span>
                    {student.budgetPercent}%
                    {student.budgetPercent >= 50 ? (
                      <small className="usage-warning">Revisar uso</small>
                    ) : null}
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

      <Link className="button secondary" href="/admin">
        Volver al panel de administración
      </Link>
    </AppShell>
  );
}
