import {
  Activity,
  AudioLines,
  BookOpenCheck,
  ChartNoAxesCombined,
  Coins,
  GraduationCap,
  LayoutDashboard,
  SearchCheck,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { IngestDocumentForm } from "@/components/admin-forms";
import { requireAdmin } from "@/lib/auth/session";
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
      icon: ShieldCheck,
      note: "Con acceso vigente",
    },
    {
      label: "Conversaciones",
      value: numberFormat(data.conversations),
      icon: BookOpenCheck,
      note: "Texto y voz en el período",
    },
    {
      label: "Simulacros",
      value: numberFormat(data.simulations),
      icon: GraduationCap,
      note: "Completados en el período",
    },
    {
      label: "Uso de voz",
      value: `${numberFormat(data.usage.audioSeconds / 60)} min`,
      icon: AudioLines,
      note: "Entrada + salida de audio",
    },
    {
      label: "Costo API estimado",
      value: data.usage.missingCosts
        ? "Incompleto"
        : moneyFormat(data.usage.knownCost),
      icon: Coins,
      note: data.usage.missingCosts
        ? `${data.usage.missingCosts} eventos sin costo calculado`
        : "USD estimado",
    },
  ];

  const modules = [
    {
      href: "/admin/students",
      title: "Estudiantes",
      description:
        "Crear cuentas, buscar estudiantes y revisar detalle individual.",
      icon: Users,
    },
    {
      href: "/admin/licenses",
      title: "Licencias",
      description: "Activar, renovar o suspender accesos mensuales.",
      icon: Wallet,
    },
    {
      href: "/admin/academics",
      title: "Seguimiento académico",
      description: "Actividad, prácticas, simulacros y temas de refuerzo.",
      icon: GraduationCap,
    },
    {
      href: "/admin/usage",
      title: "Consumo IA",
      description: "Costos, tokens, voz y presupuesto por estudiante.",
      icon: ChartNoAxesCombined,
    },
    {
      href: "/admin/system",
      title: "Sistema",
      description:
        "Tablas críticas, errores recientes y diagnóstico operativo.",
      icon: Activity,
    },
    {
      href: "/admin/settings",
      title: "Configuración",
      description: "Modelo económico, duración de licencias y tasa USD/BOB.",
      icon: Settings,
    },
  ];

  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading admin-hero">
        <div>
          <span className="eyebrow">GESTIÓN INTEGRAL</span>
          <h1>
            Panel de administración<span className="heading-dot">.</span>
          </h1>
          <p>
            Control operativo del aula: estudiantes, licencias, seguimiento
            académico, costos y estado del sistema.
          </p>
        </div>
        <span className="badge">
          <LayoutDashboard size={15} /> Administrador
        </span>
      </div>

      <form className="filter-bar admin-filter-card">
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
            {data.profiles.map((student) => (
              <option key={student.id} value={student.id}>
                {student.full_name} (@{student.username})
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">Aplicar filtros</button>
      </form>

      <div className="metrics-grid compact-metrics admin-metrics-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <metric.icon size={20} />
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </div>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Módulos administrativos</h2>
          <span>Accesos principales del administrador</span>
        </div>
        <div className="admin-module-grid">
          {modules.map((module) => (
            <Link
              className="admin-module-card"
              href={module.href}
              key={module.href}
            >
              <module.icon size={22} />
              <strong>{module.title}</strong>
              <span>{module.description}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Compendio y RAG</h2>
          <span>
            {data.unitsReady} unidades listas · {data.chunkCount} fragmentos
          </span>
        </div>
        <p className="notice success">
          El compendio FATESCIPOL 2026 está disponible para consulta académica.
          El tutor filtra fuentes según la unidad y el tema seleccionado.
        </p>
        <div className="admin-actions">
          <Link className="button primary" href="/admin/knowledge/search">
            <SearchCheck size={18} /> Probar búsqueda académica RAG
          </Link>
          <Link className="button secondary" href="/admin/usage">
            <Coins size={18} /> Revisar costos IA
          </Link>
        </div>
        {data.ingestionReport != null && (
          <details className="ingestion-report">
            <summary>Ver informe de ingesta</summary>
            <pre>{JSON.stringify(data.ingestionReport, null, 2) as string}</pre>
          </details>
        )}
      </section>

      <section className="panel admin-section admin-compact-maintenance">
        <div className="section-heading">
          <h2>Mantenimiento de Unidad 1</h2>
          <span>Herramienta heredada de carga manual</span>
        </div>
        <details>
          <summary>Cargar texto oficial de Unidad 1</summary>
          <IngestDocumentForm />
        </details>
      </section>
    </AppShell>
  );
}
