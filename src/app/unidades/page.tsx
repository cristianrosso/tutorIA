import Link from "next/link";
import { BookOpen, ClipboardCheck, GraduationCap, Mic } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth/session";
import { getUnitsWithProgress } from "@/lib/data";

function statusLabel(status?: string) {
  const labels: Record<string, string> = {
    sin_iniciar: "Sin iniciar",
    en_estudio: "En estudio",
    practicando: "Practicando",
    buen_dominio: "Buen dominio",
    necesita_refuerzo: "Necesita refuerzo",
  };
  return labels[status || "sin_iniciar"] || "Sin iniciar";
}

export default async function UnitsPage() {
  const profile = await requireProfile();
  const units = await getUnitsWithProgress();
  return (
    <AppShell profile={profile} active="units">
      <div className="page-heading">
        <div>
          <span className="eyebrow">COMPENDIO FATESCIPOL 2026</span>
          <h1>
            15 unidades temáticas<span className="heading-dot">.</span>
          </h1>
          <p>
            Selecciona una unidad para estudiar, practicar o rendir simulacro.
          </p>
        </div>
        <span className="badge">
          {units.filter((u) => u.enabled).length} de 15 habilitadas
        </span>
      </div>
      <div className="unit-grid compact-units">
        {units.map((unit) => (
          <article key={unit.id} className="unit-card enabled">
            <div className="unit-top">
              <span className="unit-number">
                {String(unit.number).padStart(2, "0")}
              </span>
              <BookOpen size={23} />
            </div>
            <span className="eyebrow">UNIDAD TEMÁTICA {unit.number}</span>
            <h2>{unit.name}</h2>
            <p>
              {unit.chunks
                ? `${unit.chunks} fragmentos del compendio · ${unit.topics.length} temas detectados`
                : "Pendiente de ingesta completa."}
            </p>
            <div className="progress-bar">
              <span style={{ width: `${unit.progress}%` }} />
            </div>
            <span className="badge neutral">
              {statusLabel(unit.status)} · {unit.progress}%
            </span>
            <div className="unit-actions">
              <Link
                href={`/unidad/${unit.number}`}
                className="button secondary"
              >
                <BookOpen size={15} /> Estudiar
              </Link>
              <Link
                href={`/tutor?unit=${unit.number}`}
                className="button secondary"
              >
                <Mic size={15} /> Hablar
              </Link>
              <Link
                href={`/practica?unit=${unit.number}`}
                className="button primary"
              >
                <ClipboardCheck size={15} /> Práctica
              </Link>
              <Link
                href={`/simulacro?unit=${unit.number}`}
                className="button secondary"
              >
                <GraduationCap size={15} /> Simulacro
              </Link>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
