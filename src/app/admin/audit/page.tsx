import { ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { getAdminAuditLogs } from "@/lib/admin/admin-service";
import { requireAdmin } from "@/lib/auth/session";

function localDateTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("es-BO", { timeZone: "America/La_Paz" })
    : "Sin fecha";
}

export default async function AdminAuditPage() {
  const profile = await requireAdmin();
  const logs = await getAdminAuditLogs();

  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">AUDITORÍA ADMINISTRATIVA</span>
          <h1>Acciones del panel.</h1>
          <p>
            Registro de creación, renovación, suspensión y cambios de acceso.
          </p>
        </div>
        <span className="badge">
          <ShieldCheck size={15} /> {logs.length} eventos
        </span>
      </div>

      <section className="panel admin-section">
        <div className="admin-table audit-table">
          <div className="admin-table-row header">
            <span>Acción</span>
            <span>Recurso</span>
            <span>Fecha</span>
            <span>Detalle</span>
          </div>
          {logs.length ? (
            logs.map((log) => (
              <div className="admin-table-row" key={log.id}>
                <span>{log.action}</span>
                <span>
                  {log.resource_type}
                  {log.resource_id ? ` · ${log.resource_id.slice(0, 8)}` : ""}
                </span>
                <span>{localDateTime(log.created_at)}</span>
                <span>
                  <code>{JSON.stringify(log.metadata)}</code>
                </span>
              </div>
            ))
          ) : (
            <p className="notice">
              Sin eventos disponibles. Aplica la migración Sprint 17 para crear
              la tabla de auditoría.
            </p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
