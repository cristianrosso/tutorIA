import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { EditStudentForms, LicenseActions } from "@/components/admin-forms";
import { requireAdmin } from "@/lib/auth/session";
import { getAdminStudentDetail } from "@/lib/admin/admin-service";
import { getEconomicSettings } from "@/lib/billing/economic-settings";

type LearningEvent = {
  event_type?: string;
  created_at?: string;
};

type ScoreSession = {
  status?: string;
  total_score?: number | null;
  max_score?: number | null;
  total_questions?: number | null;
};

function localDateTime(value?: string | null) {
  return value
    ? new Date(value).toLocaleString("es-BO", { timeZone: "America/La_Paz" })
    : "Sin registro";
}

export default async function AdminStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireAdmin();
  const { id } = await params;
  const [detail, settings] = await Promise.all([
    getAdminStudentDetail(id),
    getEconomicSettings(),
  ]);
  const student = detail.profile;
  const learningEvents = detail.learningEvents as LearningEvent[];
  const assessments = detail.assessments as ScoreSession[];
  const exams = detail.exams as ScoreSession[];

  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">DETALLE DEL ESTUDIANTE</span>
          <h1>{student.full_name}.</h1>
          <p>
            @{student.username} · {detail.licenseStatus}
          </p>
        </div>
        <Link className="button secondary" href="/admin/students">
          Volver
        </Link>
      </div>

      <div className="admin-detail-grid">
        <section className="panel admin-section">
          <h2>Perfil y acceso</h2>
          <p>Estado: {student.status}</p>
          <p>Inicio: {localDateTime(student.starts_at)}</p>
          <p>Vence: {localDateTime(student.expires_at)}</p>
          <EditStudentForms profile={student} />
          <LicenseActions
            profile={student}
            defaultDurationDays={settings.licenseDurationDays}
          />
        </section>

        <section className="panel admin-section">
          <h2>Consumo tecnológico</h2>
          <p>Operaciones: {detail.usage.operations}</p>
          <p>Tokens: {detail.usage.tokens}</p>
          <p>
            IA estimada: Bs {detail.usage.costBob.toFixed(2)} · USD{" "}
            {detail.usage.costUsd.toFixed(4)}
          </p>
        </section>

        <section className="panel admin-section">
          <h2>Licencias registradas</h2>
          {detail.licenses.length ? (
            detail.licenses.map((license) => (
              <article className="mini-row" key={license.id}>
                <strong>{license.status}</strong>
                <span>
                  {localDateTime(license.activated_at)} →{" "}
                  {localDateTime(license.expires_at)}
                </span>
              </article>
            ))
          ) : (
            <p className="notice">
              Sin historial de licencias. Se mostrará al aplicar la migración
              Sprint 17.
            </p>
          )}
        </section>

        <section className="panel admin-section">
          <h2>Actividad académica reciente</h2>
          {learningEvents.length ? (
            learningEvents.map((event, index) => (
              <article
                className="mini-row"
                key={`${event.created_at}-${index}`}
              >
                <strong>{event.event_type || "Actividad"}</strong>
                <span>{localDateTime(event.created_at)}</span>
              </article>
            ))
          ) : (
            <p className="notice">Sin eventos recientes.</p>
          )}
        </section>

        <section className="panel admin-section">
          <h2>Evaluaciones</h2>
          {assessments.length ? (
            assessments.map((item, index) => (
              <article className="mini-row" key={`assessment-${index}`}>
                <strong>{item.status || "Sin estado"}</strong>
                <span>
                  {item.total_score ?? 0}/{item.max_score ?? 0} ·{" "}
                  {item.total_questions ?? 0} preguntas
                </span>
              </article>
            ))
          ) : (
            <p className="notice">Sin evaluaciones recientes.</p>
          )}
        </section>

        <section className="panel admin-section">
          <h2>Simulacros</h2>
          {exams.length ? (
            exams.map((item, index) => (
              <article className="mini-row" key={`exam-${index}`}>
                <strong>{item.status || "Sin estado"}</strong>
                <span>
                  {item.total_score ?? 0}/{item.max_score ?? 0} ·{" "}
                  {item.total_questions ?? 0} preguntas
                </span>
              </article>
            ))
          ) : (
            <p className="notice">Sin simulacros recientes.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
