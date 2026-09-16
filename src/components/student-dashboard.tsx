import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  CheckCheck,
  Clock3,
  GraduationCap,
  Layers3,
  Mic,
  Sparkles,
} from "lucide-react";
import type { Profile } from "@/lib/models";
import { numberFormat } from "@/lib/metrics";

export function StudentDashboard({
  profile,
  stats,
}: {
  profile: Profile;
  stats: {
    conversations: number;
    simulations: number;
    documents: number;
    practices: number;
    unitsStudied: number;
    weakTopics: string[];
  };
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TU ESPACIO DE PREPARACIÓN</span>
          <h1>
            Bienvenido, {profile.full_name.split(" ")[0]}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            Prepárate para tu Examen de Grado 2026 con tu tutor inteligente.
          </p>
        </div>
        <span className="badge">
          <span className="status-dot" /> Segundo año · El Alto
        </span>
      </div>
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="eyebrow light">
            <Sparkles size={14} /> TUTOR IA FATESCIPOL
          </span>
          <h2>
            Comprende hoy.
            <br />
            Responde con confianza.
          </h2>
          <p>
            Un tutor a tu ritmo para fortalecer tus conocimientos y prepararte
            para tu examen oral.
          </p>
          <span className="hero-label">
            <BookOpen size={15} /> 15 unidades temáticas
          </span>
        </div>
        <div className="hero-orb" aria-hidden="true">
          <div className="hero-orbit" />
          <div className="hero-orbit second" />
          <div className="hero-mic">
            <AudioLines size={64} strokeWidth={1.3} />
          </div>
          <span>APRENDE · PRACTICA · AVANZA</span>
        </div>
      </section>
      <div className="section-heading">
        <h2>¿Cómo quieres prepararte?</h2>
        <span>Un paso más cerca de tu meta</span>
      </div>
      <div className="action-grid">
        <article className="action-card featured">
          <span className="action-icon">
            <Mic size={24} />
          </span>
          <span className="soon-label available">Disponible</span>
          <h3>Hablar con mi tutor</h3>
          <p>Pregunta, comprende y resuelve tus dudas mediante texto o voz.</p>
          <Link href="/tutor" className="button primary">
            <Mic size={17} /> Ver tutor
          </Link>
        </article>
        <article className="action-card">
          <span className="action-icon purple">
            <GraduationCap size={25} />
          </span>
          <span className="soon-label available">Disponible</span>
          <h3>Simulacro de examen</h3>
          <p>
            Practica tu examen oral y recibe retroalimentación sobre tus
            respuestas.
          </p>
          <Link href="/simulacro" className="button secondary">
            Iniciar simulacro <ArrowRight size={17} />
          </Link>
        </article>
        <article className="action-card">
          <span className="action-icon sand">
            <Layers3 size={25} />
          </span>
          <span className="soon-label available">15 unidades habilitadas</span>
          <h3>Mis unidades</h3>
          <p>
            Explora tu programa de estudio y conoce el material de cada unidad.
          </p>
          <Link href="/unidades" className="button secondary">
            Explorar unidades <ArrowRight size={17} />
          </Link>
        </article>
      </div>
      <div className="dashboard-lower">
        <section className="panel">
          <div className="section-heading">
            <h2>Tu punto de partida</h2>
            <Link href="/progreso">
              Ver progreso <ArrowRight size={14} />
            </Link>
          </div>
          <div className="mini-stats">
            <div>
              <span className="mini-stat-icon">
                <AudioLines size={19} />
              </span>
              <strong>{numberFormat(stats.conversations)}</strong>
              <span>Conversaciones</span>
            </div>
            <div>
              <span className="mini-stat-icon">
                <CheckCheck size={19} />
              </span>
              <strong>{numberFormat(stats.simulations)}</strong>
              <span>Simulacros completos</span>
            </div>
            <div>
              <span className="mini-stat-icon">
                <BookOpen size={19} />
              </span>
              <strong>{numberFormat(stats.documents)}</strong>
              <span>Unidades con material</span>
            </div>
          </div>
        </section>
        <section className="study-tip">
          <span className="eyebrow">
            <Clock3 size={15} /> UN BUEN HÁBITO
          </span>
          <h3>
            Pequeños pasos.
            <br />
            Preparación constante.
          </h3>
          <p>
            Reserva un momento de tu día para repasar y explicar con tus propias
            palabras lo aprendido.
          </p>
        </section>
      </div>
      <div className="notice material-notice">
        <BookOpen size={19} />
        <p>
          <strong>Tu material académico es la base.</strong> El compendio
          alimenta el tutor y el simulacro de examen oral por unidad.
        </p>
      </div>
    </>
  );
}
