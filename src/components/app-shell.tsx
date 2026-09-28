import Link from "next/link";
import {
  Activity,
  BookOpen,
  BookOpenCheck,
  Boxes,
  BrainCircuit,
  CalendarDays,
  ChartNoAxesCombined,
  CircleHelp,
  ClipboardCheck,
  Coins,
  Database,
  FileText,
  GraduationCap,
  House,
  LayoutDashboard,
  LogOut,
  Mic,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { logout } from "@/app/actions/auth";
import type { Profile } from "@/lib/models";

type ActiveSection =
  | "home"
  | "preparations"
  | "units"
  | "progress"
  | "analytics"
  | "studyPlan"
  | "classroom"
  | "recommendations"
  | "tutor"
  | "simulacro"
  | "practice"
  | "admin";

export function AppShell({
  profile,
  active,
  children,
}: {
  profile: Profile;
  active: ActiveSection;
  children: React.ReactNode;
}) {
  const studentNav: Array<{
    href: string;
    label: string;
    icon: typeof House;
    id: ActiveSection;
  }> = [
    { href: "/dashboard", label: "Mi aula", icon: House, id: "home" },
    {
      href: "/preparaciones",
      label: "Mis preparaciones",
      icon: Boxes,
      id: "preparations",
    },
    { href: "/tutor", label: "Tutor", icon: Mic, id: "tutor" },
    { href: "/clase", label: "Clase", icon: BookOpenCheck, id: "classroom" },
    { href: "/simulacro", label: "Simulacro", icon: GraduationCap, id: "simulacro" },
    { href: "/practica", label: "Práctica", icon: ClipboardCheck, id: "practice" },
    { href: "/unidades", label: "Mis unidades", icon: BookOpen, id: "units" },
    { href: "/progreso", label: "Mi progreso", icon: ChartNoAxesCombined, id: "progress" },
    { href: "/analitica", label: "Analítica", icon: ChartNoAxesCombined, id: "analytics" },
    { href: "/recomendaciones", label: "Recomendaciones", icon: BrainCircuit, id: "recommendations" },
    { href: "/plan-estudio", label: "Plan de estudio", icon: CalendarDays, id: "studyPlan" },
  ];
  const adminNav: Array<{
    href: string;
    label: string;
    icon: typeof House;
    id: ActiveSection;
  }> = [
    { href: "/admin", label: "Panel admin", icon: LayoutDashboard, id: "admin" },
    { href: "/admin/products", label: "Cursos", icon: Boxes, id: "admin" },
    { href: "/admin/students", label: "Estudiantes", icon: Users, id: "admin" },
    { href: "/admin/licenses", label: "Licencias", icon: Wallet, id: "admin" },
    { href: "/admin/knowledge", label: "Materiales", icon: Database, id: "admin" },
    { href: "/admin/academics", label: "Seguimiento", icon: GraduationCap, id: "admin" },
    { href: "/admin/analytics", label: "Analítica", icon: ChartNoAxesCombined, id: "admin" },
    { href: "/admin/usage", label: "Costos IA", icon: Coins, id: "admin" },
    { href: "/admin/system", label: "Sistema", icon: Activity, id: "admin" },
    { href: "/admin/audit", label: "Auditoría", icon: FileText, id: "admin" },
  ];
  const nav = profile.role === "ADMIN" ? adminNav : studentNav;
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link href="/dashboard" aria-label="Tutor IA FATESCIPOL, inicio">
          <Brand compact />
        </Link>
        <div className="sidebar-label">{profile.role === "ADMIN" ? "ADMINISTRACIÓN" : "MI PREPARACIÓN"}</div>
        <nav aria-label="Navegación principal">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${active === item.id ? "active" : ""}`}
              aria-current={active === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              {item.label}
              {active === item.id && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-exam">
          <GraduationCap size={24} />
          <strong>Una meta, paso a paso.</strong>
          <p>Tu preparación para el examen de grado comienza aquí.</p>
          <span>EXAMEN DE GRADO 2026</span>
        </div>
        <div className="sidebar-bottom">
          <CircleHelp size={18} />
          <p>
            ¿Necesitas ayuda?
            <br />
            <span>Contacta a tu administrador.</span>
          </p>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <span className="breadcrumb">
            Aula virtual <span>/</span> <strong>{breadcrumb(active)}</strong>
          </span>
          <div className="header-user">
            <span className="year-tag">GESTIÓN 2026</span>
            <span className="avatar">
              {profile.full_name
                .split(" ")
                .slice(0, 2)
                .map((n) => n[0])
                .join("")}
            </span>
            <div className="user-label">
              <strong>{profile.full_name}</strong>
              <span>
                {profile.role === "ADMIN"
                  ? "Administrador"
                  : "Estudiante · Segundo año"}
              </span>
            </div>
            <form action={logout}>
              <button
                className="icon-button"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <main id="main" className="dashboard-content">
          {children}
        </main>
        <footer className="dashboard-footer">
          <span>
            <ShieldCheck size={14} /> FATESCIPOL El Alto
          </span>
          <span>Conocimiento que fortalece tu vocación.</span>
        </footer>
      </div>
    </div>
  );
}

function breadcrumb(active: ActiveSection) {
  if (active === "admin") return "Administración";
  if (active === "preparations") return "Mis preparaciones";
  if (active === "units") return "Mis unidades";
  if (active === "progress") return "Mi progreso";
  if (active === "analytics") return "Analítica";
  if (active === "recommendations") return "Recomendaciones";
  if (active === "studyPlan") return "Plan de estudio";
  if (active === "tutor") return "Tutor";
  if (active === "classroom") return "Clase";
  if (active === "simulacro") return "Simulacro";
  if (active === "practice") return "Práctica";
  return "Inicio";
}



