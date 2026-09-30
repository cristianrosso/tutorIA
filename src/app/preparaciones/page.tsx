import Link from "next/link";
import { ArrowRight, BookOpenCheck, FileText, GraduationCap, Layers3, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth/session";
import { getUnitsWithProgress } from "@/lib/data";
import { listProductsForUser } from "@/lib/products/products";

export default async function PreparacionesPage() {
  const profile = await requireProfile();
  const products = await listProductsForUser(profile);
  const productSummaries = await Promise.all(
    products.map(async (product) => {
      const units = await getUnitsWithProgress(product.id);
      const publishedUnits = units.filter((unit) => unit.enabled && unit.chunks > 0);
      const topics = units.reduce((total, unit) => total + unit.topics.length, 0);
      const chunks = units.reduce((total, unit) => total + unit.chunks, 0);
      const progress = units.length
        ? Math.round(units.reduce((total, unit) => total + unit.progress, 0) / units.length)
        : 0;
      return { product, units, publishedUnits, topics, chunks, progress };
    }),
  );

  return (
    <AppShell profile={profile} active="home">
      <div className="preparations-hero">
        <div className="preparations-hero-copy">
          <span className="eyebrow">MIS PREPARACIONES</span>
          <h1>
            Elige primero tu curso o examen<span className="heading-dot">.</span>
          </h1>
          <p>
            Cada preparación trabaja con su propia base de conocimiento, materias, progreso, simulacros y costos.
          </p>
        </div>
        <div className="preparations-summary-card">
          <ShieldCheck size={18} />
          <strong>{products.length}</strong>
          <span>acceso(s) vigente(s)</span>
        </div>
      </div>

      <section className="preparations-catalog">
        <div className="preparations-catalog-header">
          <div>
            <span className="eyebrow">CATÁLOGO ACADÉMICO</span>
            <h2>Selecciona una preparación para continuar</h2>
          </div>
          <span>Separado por curso, examen y material publicado.</span>
        </div>
        <div className="preparation-card-grid">
          {productSummaries.map(({ product, units, publishedUnits, topics, chunks, progress }, index) => (
            <article className="preparation-card" key={product.id}>
              <div className="preparation-card-topline">
                <div className="preparation-icon">
                  <GraduationCap size={24} />
                </div>
                <div>
                  <span>Preparación {String(index + 1).padStart(2, "0")}</span>
                  <strong>{product.short_name}</strong>
                </div>
              </div>

              <div className="preparation-card-body">
                <h3>{product.name}</h3>
                <p>
                  {product.institution_name || "Institución no configurada"}
                  {product.exam_name ? ` · ${product.exam_name}` : ""}
                  {product.exam_year ? ` · Gestión ${product.exam_year}` : ""}
                </p>
              </div>

              <div className="preparation-metrics" aria-label="Resumen académico">
                <span>
                  <BookOpenCheck size={16} />
                  <strong>{publishedUnits.length || units.length}</strong> materias
                </span>
                <span>
                  <Layers3 size={16} />
                  <strong>{topics}</strong> temas
                </span>
                <span>
                  <FileText size={16} />
                  <strong>{chunks}</strong> fragmentos
                </span>
              </div>

              <div className="preparation-progress">
                <div>
                  <span>Avance general</span>
                  <strong>{progress}%</strong>
                </div>
                <div className="preparation-progress-track">
                  <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
                </div>
              </div>

              <div className="preparation-actions">
                <Link className="button primary" href={`/dashboard?product=${product.slug}`}>
                  Entrar al curso <ArrowRight size={17} />
                </Link>
                <Link className="button secondary" href={`/unidades?product=${product.slug}`}>
                  Ver materias
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
