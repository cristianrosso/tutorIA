import Link from "next/link";

const links = [
  ["/admin", "Inicio"],
  ["/admin/students", "Estudiantes"],
  ["/admin/licenses", "Licencias"],
  ["/admin/academics", "Académico"],
  ["/admin/knowledge", "Conocimiento"],
  ["/admin/usage", "Consumo"],
  ["/admin/system", "Sistema"],
  ["/admin/settings", "Configuración"],
  ["/admin/audit", "Auditoría"],
] as const;

export function AdminNav() {
  return (
    <nav className="admin-subnav" aria-label="Navegación administrativa">
      {links.map(([href, label]) => (
        <Link href={href} key={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
