import Link from "next/link";
import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Mic,
  MessageSquareText,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StudentCourseSwitcher } from "@/components/student-course-switcher";
import { requireProfile } from "@/lib/auth/session";
import { getUnitByNumber, getUnitTopics } from "@/lib/data";
import { getStudentProductContext, withProduct } from "@/lib/products/selection";

export default async function UnitDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ product?: string }>;
}) {
  const profile = await requireProfile();
  const resolved = await params;
  const query = await searchParams;
  const productContext = await getStudentProductContext(profile, query.product);
  const unitNumber = Math.min(15, Math.max(1, Number(resolved.id) || 1));
  const unit = await getUnitByNumber(unitNumber);
  const topics = await getUnitTopics(unitNumber, productContext.activeProduct.id);
  return (
    <AppShell profile={profile} active="units">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{productContext.activeProduct.short_name} · UNIDAD {unit.number}</span>
          <h1>
            {unit.name}
            <span className="heading-dot">.</span>
          </h1>
          <p>
            Temas detectados solo para el curso activo. El tutor filtrará el RAG por
            esta unidad y curso.
          </p>
        </div>
        <span className="badge">
          <BookOpen size={15} /> {topics.length} temas
        </span>
      </div>
      <StudentCourseSwitcher
        products={productContext.products}
        activeProduct={productContext.activeProduct}
        basePath={`/unidad/${unit.number}`}
      />
      <section className="panel unit-detail-actions">
        <Link className="button primary" href={withProduct(`/tutor?unit=${unit.number}`, productContext.activeProduct)}>
          <MessageSquareText size={16} /> Estudiar con mi tutor
        </Link>
        <Link className="button secondary" href={withProduct(`/tutor?unit=${unit.number}`, productContext.activeProduct)}>
          <Mic size={16} /> Hablar con mi tutor
        </Link>
        <Link
          className="button primary"
          href={withProduct(`/practica?unit=${unit.number}`, productContext.activeProduct)}
        >
          <ClipboardCheck size={16} /> Práctica formativa
        </Link>
        <Link
          className="button secondary"
          href={withProduct(`/simulacro?unit=${unit.number}`, productContext.activeProduct)}
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
                href={withProduct(`/tutor?unit=${unit.number}&section=${encodeURIComponent(topic.name)}`, productContext.activeProduct)}
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
