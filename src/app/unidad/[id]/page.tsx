import Link from "next/link";
import {
  BookOpen,
  GraduationCap,
  Mic,
  MessageSquareText,
  PlayCircle,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth/session";
import { getUnitByNumber, getUnitTopics } from "@/lib/data";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile();
  const resolved = await params;
  const unitNumber = Math.min(15, Math.max(1, Number(resolved.id) || 1));
  const unit = await getUnitByNumber(unitNumber);
  const topics = await getUnitTopics(unitNumber);
  return (
    <AppShell profile={profile} active="units">
      <div className="page-heading">
        <div>
          <span className="eyebrow">UNIDAD {unit.number}</span>
          <h1>
            {unit.name}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            Temas detectados desde el compendio. El tutor filtrará el RAG por
            esta unidad.
          </p>
        </div>
        <span className="badge">
          <BookOpen size={15} /> {topics.length} temas
        </span>
      </div>
      <section className="panel unit-detail-actions">
        <Link className="button primary" href={`/tutor?unit=${unit.number}`}>
          <MessageSquareText size={16} /> Estudiar con mi tutor
        </Link>
        <Link className="button secondary" href={`/tutor?unit=${unit.number}`}>
          <Mic size={16} /> Hablar con mi tutor
        </Link>
        <Link
          className="button secondary"
          href={`/tutor?unit=${unit.number}&intent=pregunta`}
        >
          <PlayCircle size={16} /> Practicar
        </Link>
        <Link
          className="button secondary"
          href={`/simulacro?unit=${unit.number}`}
        >
          <GraduationCap size={16} /> Simulacro oral
        </Link>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Temas y subtemas disponibles</h2>
          <span>Provienen de la ingesta del compendio</span>
        </div>
        <div className="topic-list" role="list">
          {topics.length ? (
            topics.map((topic) => (
              <Link
                className="topic-item"
                key={`${topic.section || "tema"}-${topic.name}`}
                href={`/tutor?unit=${unit.number}&section=${encodeURIComponent(topic.name)}`}
                role="listitem"
              >
                <span className="topic-main">
                  {topic.section ? (
                    <span className="topic-number">{topic.section}</span>
                  ) : null}
                  <span className="topic-title">{topic.name}</span>
                </span>
                <small>{topic.count} fragmentos</small>
              </Link>
            ))
          ) : (
            <p className="notice">
              Todavía no hay temas detectados para esta unidad. Ejecuta la
              ingesta completa del compendio.
            </p>
          )}
        </div>
      </section>
    </AppShell>
  );
}
