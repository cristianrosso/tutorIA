import Link from "next/link";
import {
  BookOpen,
  BrainCircuit,
  ChartNoAxesCombined,
  CircleHelp,
  ClipboardCheck,
  GraduationCap,
  House,
  LayoutDashboard,
  LogOut,
  Mic,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { logout } from "@/app/actions/auth";
import type { Profile } from "@/lib/models";

type ActiveSection =
  | "home"
  | "units"
  | "progress"
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
  const nav: Array<{
    href: string;
    label: string;
    icon: typeof House;
    id: ActiveSection;
  }> = [
    { href: "/dashboard", label: "Mi aula", icon: House, id: "home" },
    { href: "/tutor", label: "Tutor", icon: Mic, id: "tutor" },
    {
      href: "/simulacro",
      label: "Simulacro",
      icon: GraduationCap,
      id: "simulacro",
    },
    {
      href: "/practica",
      label: "Práctica",
      icon: ClipboardCheck,
      id: "practice",
    },
    { href: "/unidades", label: "Mis unidades", icon: BookOpen, id: "units" },
    {
      href: "/progreso",
      label: "Mi progreso",
      icon: ChartNoAxesCombined,
      id: "progress",
    },
    {
      href: "/recomendaciones",
      label: "Recomendaciones",
      icon: BrainCircuit,
      id: "recommendations",
    },
  ];
  if (profile.role === "ADMIN") {
    nav.push({
      href: "/admin",
      label: "Administración",
      icon: LayoutDashboard,
      id: "admin",
    });
  }
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link href="/dashboard" aria-label="Tutor IA FATESCIPOL, inicio">
          <Brand compact />
        </Link>
        <div className="sidebar-label">MI PREPARACIÓN</div>
        <nav aria-label="Navegación principal">
          {nav.map((item) => (
            <Link
              key={item.id}
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
  if (active === "units") return "Mis unidades";
  if (active === "progress") return "Mi progreso";
  if (active === "recommendations") return "Recomendaciones";
  if (active === "tutor") return "Tutor";
  if (active === "simulacro") return "Simulacro";
  if (active === "practice") return "Práctica";
  return "Inicio";
}
