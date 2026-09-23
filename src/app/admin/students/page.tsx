import Link from "next/link";
import { Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { CreateStudentForm, LicenseActions } from "@/components/admin-forms";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminStudents } from "@/lib/admin/admin-service";
import { getEconomicSettings } from "@/lib/billing/economic-settings";

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const profile = await requireAdmin();
  const params = await searchParams;
  const [result, settings] = await Promise.all([
    getAdminStudents({
      query: params.q,
      status: params.status || "all",
      page: Number(params.page || 1),
    }),
    getEconomicSettings(),
  ]);
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">GESTIÓN DE ESTUDIANTES</span>
          <h1>Estudiantes.</h1>
          <p>
            Búsqueda, registro y estado de licencia de las cuentas
            estudiantiles.
          </p>
        </div>
        <span className="badge">
          <Users size={15} /> {result.total} registros
        </span>
      </div>
      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Registrar estudiante</h2>
          <span>Licencia inicial segura</span>
        </div>
        <CreateStudentForm />
      </section>
      <section className="panel admin-section">
        <form className="filter-bar">
          <label>
            Buscar
            <input
              name="q"
              defaultValue={params.q || ""}
              placeholder="Nombre o usuario"
            />
          </label>
          <label>
            Estado
            <select name="status" defaultValue={params.status || "all"}>
              <option value="all">Todos</option>
              <option value="active">Activa</option>
              <option value="pending">Pendiente</option>
              <option value="expired">Vencida</option>
              <option value="suspended">Suspendida</option>
            </select>
          </label>
          <button className="button secondary">Filtrar</button>
        </form>
        <div className="admin-table">
          <div className="admin-table-row header">
            <span>Estudiante</span>
            <span>Cuenta</span>
            <span>Licencia</span>
            <span>Vence</span>
            <span>Acciones</span>
          </div>
          {result.students.map((student) => (
            <div className="admin-table-row" key={student.id}>
              <span>
                <strong>{student.full_name}</strong>
                <small>@{student.username}</small>
              </span>
              <span>{student.status}</span>
              <span>
                <span
                  className={`badge ${student.licenseStatus === "active" ? "" : "neutral"}`}
                >
                  {student.licenseStatus}
                </span>
              </span>
              <span>
                {student.expires_at
                  ? new Date(student.expires_at).toLocaleDateString("es-BO", {
                      timeZone: "America/La_Paz",
                    })
                  : "Sin vencimiento"}
              </span>
              <span className="table-actions">
                <Link
                  className="button secondary"
                  href={`/admin/students/${student.id}`}
                >
                  Detalle
                </Link>
                <LicenseActions
                  profile={student}
                  defaultDurationDays={settings.licenseDurationDays}
                />
              </span>
            </div>
          ))}
        </div>
        <div className="pagination-row">
          <span>
            Página {result.page} de {totalPages}
          </span>
          {result.page > 1 ? (
            <Link
              className="button secondary"
              href={`/admin/students?page=${result.page - 1}`}
            >
              Anterior
            </Link>
          ) : null}
          {result.page < totalPages ? (
            <Link
              className="button secondary"
              href={`/admin/students?page=${result.page + 1}`}
            >
              Siguiente
            </Link>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
