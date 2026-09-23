import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { getAdminSystemStatus } from "@/lib/admin/admin-service";
import { requireAdmin } from "@/lib/auth/session";

type EventRow = {
  operation_type?: string;
  model_used?: string;
  created_at?: string;
  id?: string;
  status?: string;
};

function localDateTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("es-BO", { timeZone: "America/La_Paz" })
    : "Sin fecha";
}

export default async function AdminSystemPage() {
  const profile = await requireAdmin();
  const status = await getAdminSystemStatus();
  const recentUsage = status.recentUsage as EventRow[];
  const failedExams = status.failedExams as EventRow[];
  const failedClasses = status.failedClasses as EventRow[];

  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">ESTADO DEL SISTEMA</span>
          <h1>Salud operativa.</h1>
          <p>
            Verificación básica de tablas críticas, consumo y errores recientes.
          </p>
        </div>
        <span className="badge">
          <Activity size={15} /> Diagnóstico
        </span>
      </div>

      <section className="panel admin-section">
        <h2>Tablas críticas</h2>
        <div className="admin-table two-col-table">
          {status.checks.map((check) => (
            <div className="admin-table-row" key={check.name}>
              <span>
                {check.ok ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <AlertTriangle size={16} />
                )}
                <strong>{check.name}</strong>
              </span>
              <span>{check.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="admin-detail-grid">
        <section className="panel admin-section">
          <h2>Consumo reciente</h2>
          {recentUsage.length ? (
            recentUsage.map((event, index) => (
              <article
                className="mini-row"
                key={`${event.created_at}-${index}`}
              >
                <strong>{event.operation_type || "Operación IA"}</strong>
                <span>
                  {event.model_used || "modelo no registrado"} ·{" "}
                  {localDateTime(event.created_at)}
                </span>
              </article>
            ))
          ) : (
            <p className="notice">Sin eventos recientes de IA.</p>
          )}
        </section>

        <section className="panel admin-section">
          <h2>Simulacros con error</h2>
          {failedExams.length ? (
            failedExams.map((event) => (
              <article className="mini-row" key={event.id}>
                <strong>{event.status || "error"}</strong>
                <span>{localDateTime(event.created_at)}</span>
              </article>
            ))
          ) : (
            <p className="notice success">
              Sin errores recientes de simulacro.
            </p>
          )}
        </section>

        <section className="panel admin-section">
          <h2>Clases guiadas con error</h2>
          {failedClasses.length ? (
            failedClasses.map((event) => (
              <article className="mini-row" key={event.id}>
                <strong>{event.status || "error"}</strong>
                <span>{localDateTime(event.created_at)}</span>
              </article>
            ))
          ) : (
            <p className="notice success">Sin errores recientes de clase.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
