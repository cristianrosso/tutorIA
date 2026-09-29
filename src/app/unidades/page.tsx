import Link from "next/link";
import { BookOpen, ClipboardCheck, GraduationCap, Mic } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { StudentCourseSwitcher } from "@/components/student-course-switcher";
import { requireProfile } from "@/lib/auth/session";
import { getUnitsWithProgress } from "@/lib/data";
import { getStudentProductContext, withProduct } from "@/lib/products/selection";

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

export default async function UnitsPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const profile = await requireProfile();
  const params = await searchParams;
  const productContext = await getStudentProductContext(profile, params.product);
  const units = await getUnitsWithProgress(productContext.activeProduct.id);
  return (
    <AppShell profile={profile} active="units">
      <div className="page-heading">
        <div>
          <span className="eyebrow">{productContext.activeProduct.short_name}</span>
          <h1>
            Contenidos del curso<span className="heading-dot">.</span>
          </h1>
          <p>
            Selecciona una unidad dentro de {productContext.activeProduct.name}.
          </p>
        </div>
        <span className="badge">
          {units.filter((u) => u.chunks > 0).length} con material
        </span>
      </div>
      <StudentCourseSwitcher
        products={productContext.products}
        activeProduct={productContext.activeProduct}
        basePath="/unidades"
      />
      {units.length ? (
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
                href={withProduct(`/unidad/${unit.number}`, productContext.activeProduct)}
                className="button secondary"
              >
                <BookOpen size={15} /> Estudiar
              </Link>
              <Link
                href={withProduct(`/tutor?unit=${unit.number}`, productContext.activeProduct)}
                className="button secondary"
              >
                <Mic size={15} /> Hablar
              </Link>
              <Link
                href={withProduct(`/practica?unit=${unit.number}`, productContext.activeProduct)}
                className="button primary"
              >
                <ClipboardCheck size={15} /> Práctica
              </Link>
              <Link
                href={withProduct(`/simulacro?unit=${unit.number}`, productContext.activeProduct)}
                className="button secondary"
              >
                <GraduationCap size={15} /> Simulacro
              </Link>
            </div>
          </article>
        ))}
        </div>
      ) : (
        <section className="panel">
          <div className="section-heading">
            <h2>Sin unidades publicadas para este curso</h2>
            <span>Curso activo: {productContext.activeProduct.short_name}</span>
          </div>
          <p className="notice error">
            Este curso tiene preparación asignada, pero todavía no tiene material publicado al RAG/conocimiento. En Administración → Conocimiento debes procesar y publicar el documento cargado para que aparezcan sus unidades y temas aquí.
          </p>
        </section>
      )}
    </AppShell>
  );
}
