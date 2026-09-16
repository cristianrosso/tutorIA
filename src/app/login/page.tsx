import Link from "next/link";
import {
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Check,
  GraduationCap,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { LoginForm } from "@/components/login-form";
import { isConfigured } from "@/lib/config";
import { getCurrentProfile } from "@/lib/auth/session";
import { accessProblem } from "@/lib/auth/rules";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const configured = isConfigured();
  const profile = await getCurrentProfile();
  if (profile && !accessProblem(profile))
    redirect(profile.role === "ADMIN" ? "/admin" : "/dashboard");
  const params = await searchParams;
  return (
    <main id="main" className="login-page">
      <section className="welcome-panel">
        <Brand />
        <div className="welcome-content">
          <span className="eyebrow light">
            <span className="status-dot" /> EXAMEN DE GRADO 2026
          </span>
          <h1>
            Tu vocación.
            <br />
            Tu preparación.
            <br />
            <em>Tu siguiente paso.</em>
          </h1>
          <p>
            Un espacio para comprender, practicar y llegar con confianza a tu
            examen de grado.
          </p>
          <div className="tutor-illustration" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="core-glow" />
            <div className="tutor-core">
              <AudioLines size={67} strokeWidth={1.3} />
            </div>
            <span className="floating-chip chip-one">
              <BookOpen size={15} /> Comprende
            </span>
            <span className="floating-chip chip-two">
              <Sparkles size={15} /> Practica
            </span>
            <span className="floating-chip chip-three">
              <Check size={15} /> Avanza
            </span>
            <span className="orbit-dot dot-one" />
            <span className="orbit-dot dot-two" />
          </div>
          <div className="institution-line">
            <ShieldCheck size={19} />
            <span>
              Facultad Técnica Superior en Ciencias Policiales
              <br />
              <strong>El Alto · Bolivia</strong>
            </span>
          </div>
        </div>
        <div className="welcome-footer">
          <span>DISCIPLINA · CONOCIMIENTO · SERVICIO</span>
          <span>01 / 2026</span>
        </div>
      </section>
      <section className="access-panel">
        <div className="access-top">
          <span>AULA VIRTUAL</span>
          <span className="edition-pill">Edición 2026</span>
        </div>
        <div className="access-content">
          <div className="section-icon">
            <GraduationCap size={27} />
          </div>
          <span className="eyebrow">BIENVENIDO A TU ESPACIO DE ESTUDIO</span>
          <h2>Tutor IA FATESCIPOL</h2>
          <p className="access-description">
            Prepárate para tu Examen de Grado 2026 con tu tutor inteligente.
          </p>
          {!configured && (
            <div className="notice setup-notice">
              <span className="status-dot" />
              <div>
                <strong>Estamos preparando tu aula</strong>
                <p>
                  El acceso se habilitará cuando el administrador complete la
                  configuración.
                </p>
                <Link href="/configuracion">
                  Ver estado de configuración <ArrowUpRight size={14} />
                </Link>
              </div>
            </div>
          )}
          {params.estado === "sin-acceso" && (
            <p className="notice error" role="alert">
              Tu cuenta no está vigente. Contacta a tu administrador para
              habilitar el acceso.
            </p>
          )}
          <LoginForm configured={configured} />
          <div className="academic-note">
            <BookOpen size={19} />
            <p>
              <strong>Aprendizaje con respaldo académico</strong>
              <br />
              Basado en el Compendio para Examen de Grado 2026. Unidad inicial:
              Doctrina Policial.
            </p>
          </div>
        </div>
        <footer className="access-footer">
          <span>
            <LockIcon /> Acceso personal y protegido
          </span>
          <span>FATESCIPOL · EL ALTO</span>
        </footer>
      </section>
    </main>
  );
}
function LockIcon() {
  return <ShieldCheck size={14} />;
}
