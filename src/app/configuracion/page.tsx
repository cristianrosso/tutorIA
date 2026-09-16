import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Database,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { isConfigured } from "@/lib/config";
export default function ConfigurationPage() {
  const configured = isConfigured();
  return (
    <main id="main" className="setup-page">
      <div className="setup-header">
        <Brand />
        <Link href="/login">
          <ArrowLeft size={16} /> Volver al acceso
        </Link>
      </div>
      <section className="setup-card">
        <span className="section-icon">
          <Database />
        </span>
        <span className="eyebrow">PREPARACIÓN DEL AULA</span>
        <h1>
          {configured ? "Configuración registrada" : "Conectemos tu aula"}
        </h1>
        <p className="muted">
          {configured
            ? "Las variables están presentes. Verifica la conexión iniciando sesión con una cuenta creada en Supabase."
            : "La aplicación está lista para conectarse a un proyecto Supabase. Todavía no hay cuentas ni datos académicos cargados."}
        </p>
        <ol className="setup-steps">
          <li>
            <CheckCircle2 />
            <div>
              <strong>Aplicación y estructura preparadas</strong>
              <p>Interfaz, roles y migración de base de datos.</p>
            </div>
          </li>
          <li>
            <Circle />
            <div>
              <strong>Crear el proyecto Supabase</strong>
              <p>
                Configura las variables de entorno siguiendo el README del
                proyecto.
              </p>
            </div>
          </li>
          <li>
            <Circle />
            <div>
              <strong>Aplicar el esquema SQL</strong>
              <p>
                La migración crea las tablas, permisos y las 15 unidades del
                compendio académico.
              </p>
            </div>
          </li>
          <li>
            <Circle />
            <div>
              <strong>Crear el primer administrador</strong>
              <p>
                Ejecuta el asistente de alta local y verifica el inicio de
                sesión.
              </p>
            </div>
          </li>
        </ol>
        <div className="notice">
          <ShieldCheck size={20} />
          <p>
            Las claves se configuran en el servidor. Nunca se introducen en esta
            página.
          </p>
        </div>
        <Link href="/login" className="button primary">
          Volver al inicio de sesión
        </Link>
      </section>
      <p className="setup-footnote">
        Sprint 1 · Base de acceso y administración
      </p>
    </main>
  );
}
