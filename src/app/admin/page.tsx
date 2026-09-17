import {
  AudioLines,
  Coins,
  SearchCheck,
  GraduationCap,
  MessageSquare,
  Users,
  UserCheck,
  Zap,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import {
  CreateStudentForm,
  EditStudentForms,
  IngestDocumentForm,
} from "@/components/admin-forms";
import { requireAdmin } from "@/lib/auth/session";
import { accessProblem } from "@/lib/auth/rules";
import { getAdminData } from "@/lib/data";
import { moneyFormat, numberFormat } from "@/lib/metrics";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; user?: string }>;
}) {
  const profile = await requireAdmin();
  const params = await searchParams;
  const period = ["day", "week", "month"].includes(params.period || "")
    ? params.period!
    : "month";
  const userId = z.uuid().safeParse(params.user);
  const data = await getAdminData(
    period,
    userId.success ? userId.data : undefined,
  );
  const metrics = [
    {
      label: "Usuarios registrados",
      value: numberFormat(data.profiles.length),
      icon: Users,
      note: "Todas las cuentas",
    },
    {
      label: "Usuarios activos",
      value: numberFormat(data.active),
      icon: UserCheck,
      note: "Con acceso vigente ahora",
    },
    {
      label: "Conversaciones",
      value: numberFormat(data.conversations),
      icon: MessageSquare,
      note: "Texto y voz en el período",
    },
    {
      label: "Simulacros realizados",
      value: numberFormat(data.simulations),
      icon: GraduationCap,
      note: "Completados en el período",
    },
    {
      label: "Tokens consumidos",
      value: numberFormat(data.usage.tokens),
      icon: Zap,
      note: "Entrada + salida",
    },
    {
      label: "Uso de voz",
      value: `${numberFormat(data.usage.audioSeconds / 60)} min`,
      icon: AudioLines,
      note: "Entrada + salida de audio",
    },
    {
      label: "Costo estimado API",
      value: data.usage.missingCosts
        ? "Incompleto"
        : moneyFormat(data.usage.knownCost),
      icon: Coins,
      note: data.usage.missingCosts
        ? `${data.usage.missingCosts} eventos sin costo calculado`
        : "USD · No equivale a facturación",
    },
    {
      label: "Promedio por estudiante",
      value:
        data.usage.averageCost === null
          ? "—"
          : moneyFormat(data.usage.averageCost),
      icon: Wallet,
      note: "USD · Incluye estudiantes sin uso",
    },
  ];
  return (
    <AppShell profile={profile} active="admin">
      <div className="page-heading">
        <div>
          <span className="eyebrow">GESTIÓN ACADÉMICA</span>
          <h1>
            Panel de administración<span className="heading-dot">.</span>
          </h1>
          <p>Accesos, actividad y consumo de tu aula virtual.</p>
        </div>
        <span className="badge">Administrador</span>
      </div>
      <form className="filter-bar">
        <label>
          Período
          <select name="period" defaultValue={period}>
            <option value="day">Últimas 24 horas</option>
            <option value="week">Últimos 7 días</option>
            <option value="month">Últimos 30 días</option>
          </select>
        </label>
        <label>
          Actividad de
          <select name="user" defaultValue={userId.success ? userId.data : ""}>
            <option value="">Todos los usuarios</option>
            {data.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} (@{p.username})
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">Aplicar filtros</button>
        <p>
          Los filtros se aplican a la actividad y al consumo. Las cuentas
          muestran el total actual.
        </p>
      </form>
      <div className="metrics-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <metric.icon size={20} />
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </div>
      {data.eventCount === 0 && (
        <p className="notice">
          No hay eventos de consumo en este período. La integración de IA y el
          registro automático se implementarán en un sprint posterior.
        </p>
      )}
      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Compendio académico completo</h2>
          <span>
            {data.unitsReady} unidades listas · {data.chunkCount} fragmentos
          </span>
        </div>
        <p className="notice success">
          La ingesta del compendio FATESCIPOL 2026 está disponible para las 15
          unidades y el tutor filtra las fuentes según la unidad seleccionada.
        </p>
        <div className="admin-actions">
          <Link className="button primary" href="/admin/knowledge/search">
            <SearchCheck size={18} />
            Probar búsqueda académica RAG
          </Link>
        </div>
        {data.ingestionReport != null && (
          <details className="ingestion-report">
            <summary>Ver informe de ingesta</summary>
            <pre>{JSON.stringify(data.ingestionReport, null, 2) as string}</pre>
          </details>
        )}
        <IngestDocumentForm />
        {data.documents.length > 0 && (
          <div className="document-list">
            {data.documents.map((document) => (
              <article key={document.id}>
                <strong>{document.title}</strong>
                <span>
                  {document.source} · {document.version}
                </span>
                <small>{document.status}</small>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Nuevo estudiante</h2>
          <span>Acceso personal al aula</span>
        </div>
        <CreateStudentForm />
      </section>
      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Usuarios del aula</h2>
          <span>{data.profiles.length} cuentas</span>
        </div>
        <div className="users-list">
          {data.profiles.map((p) => (
            <article className="user-row" key={p.id}>
              <div className="user-row-main">
                <span className="avatar">{p.full_name[0]}</span>
                <div>
                  <strong>{p.full_name}</strong>
                  <span>
                    @{p.username} ·{" "}
                    {p.role === "ADMIN" ? "Administrador" : "Estudiante"}
                  </span>
                </div>
                <span className={`badge ${accessProblem(p) ? "neutral" : ""}`}>
                  {accessProblem(p)
                    ? p.status === "inactive"
                      ? "Inactivo"
                      : Date.parse(p.starts_at) > data.referenceTime
                        ? "Programado"
                        : "Expirado"
                    : "Activo"}
                </span>
              </div>
              <div className="user-dates">
                Inicio:{" "}
                {new Date(p.starts_at).toLocaleDateString("es-BO", {
                  timeZone: "America/La_Paz",
                })}{" "}
                · Vence:{" "}
                {p.expires_at
                  ? new Date(p.expires_at).toLocaleDateString("es-BO", {
                      timeZone: "America/La_Paz",
                    })
                  : "Sin vencimiento"}
              </div>
              {p.role === "ESTUDIANTE" && <EditStudentForms profile={p} />}
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
