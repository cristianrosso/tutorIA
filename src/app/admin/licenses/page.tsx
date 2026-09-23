import Link from "next/link";
import { CalendarClock, UserCheck, UserX } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { LicenseActions } from "@/components/admin-forms";
import { getAdminLicenses } from "@/lib/admin/admin-service";
import { requireAdmin } from "@/lib/auth/session";
import { getEconomicSettings } from "@/lib/billing/economic-settings";

function localDate(value?: string | null) {
  return value
    ? new Date(value).toLocaleDateString("es-BO", {
        timeZone: "America/La_Paz",
      })
    : "Sin vencimiento";
}

export default async function AdminLicensesPage() {
  const profile = await requireAdmin();
  const [licenses, settings] = await Promise.all([
    getAdminLicenses(),
    getEconomicSettings(),
  ]);

  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">LICENCIAS MENSUALES</span>
          <h1>Accesos de estudiantes.</h1>
          <p>
            Duración configurada: {settings.licenseDurationDays} días · objetivo
            Bs {settings.monthlyStudentBudgetBob} por estudiante.
          </p>
        </div>
        <span className="badge">
          <CalendarClock size={15} /> {licenses.counts.active} activas
        </span>
      </div>

      <div className="metrics-grid compact-metrics">
        <article className="metric-card">
          <UserCheck size={20} />
          <span>Activas</span>
          <strong>{licenses.counts.active}</strong>
          <small>Estudiantes con acceso vigente</small>
        </article>
        <article className="metric-card">
          <CalendarClock size={20} />
          <span>Pendientes</span>
          <strong>{licenses.counts.pending}</strong>
          <small>Programadas para iniciar</small>
        </article>
        <article className="metric-card">
          <UserX size={20} />
          <span>Vencidas</span>
          <strong>{licenses.counts.expired}</strong>
          <small>Requieren renovación</small>
        </article>
        <article className="metric-card">
          <UserX size={20} />
          <span>Suspendidas</span>
          <strong>{licenses.counts.suspended}</strong>
          <small>Acceso inactivo</small>
        </article>
      </div>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Gestión de licencias</h2>
          <span>No modifica pagos ni registros históricos</span>
        </div>
        <div className="admin-table">
          <div className="admin-table-row header">
            <span>Estudiante</span>
            <span>Estado</span>
            <span>Inicio</span>
            <span>Vencimiento</span>
            <span>Acciones</span>
          </div>
          {licenses.rows.map((student) => (
            <div className="admin-table-row" key={student.id}>
              <span>
                <strong>{student.fullName}</strong>
                <small>@{student.username}</small>
              </span>
              <span>
                <span
                  className={`badge ${
                    student.licenseStatus === "active" ? "" : "neutral"
                  }`}
                >
                  {student.licenseStatus}
                </span>
              </span>
              <span>{localDate(student.startsAt)}</span>
              <span>{localDate(student.expiresAt)}</span>
              <span className="table-actions">
                <Link
                  className="button secondary"
                  href={`/admin/students/${student.id}`}
                >
                  Detalle
                </Link>
                <LicenseActions
                  profile={{
                    id: student.id,
                    starts_at: student.startsAt,
                    expires_at: student.expiresAt,
                    status: student.status,
                  }}
                  defaultDurationDays={settings.licenseDurationDays}
                />
              </span>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
