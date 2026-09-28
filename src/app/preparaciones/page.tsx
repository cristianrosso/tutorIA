import Link from "next/link";
import { ArrowRight, BookOpenCheck, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth/session";
import { listProductsForUser } from "@/lib/products/products";

export default async function PreparacionesPage() {
  const profile = await requireProfile();
  const products = await listProductsForUser(profile);

  return (
    <AppShell profile={profile} active="home">
      <div className="page-heading admin-hero">
        <div>
          <span className="eyebrow">MIS PREPARACIONES</span>
          <h1>
            Selecciona tu curso o examen<span className="heading-dot">.</span>
          </h1>
          <p>
            Cada preparación conserva sus fuentes, progreso, evaluaciones y costos separados.
          </p>
        </div>
        <span className="badge">
          <ShieldCheck size={15} /> Acceso vigente
        </span>
      </div>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Preparaciones disponibles</h2>
          <span>{products.length} acceso(s) académico(s)</span>
        </div>
        <div className="product-card-grid">
          {products.map((product) => (
            <article className="product-card" key={product.id}>
              <BookOpenCheck size={24} />
              <span>{product.short_name}</span>
              <h3>{product.name}</h3>
              <p>
                {product.institution_name || "Institución no configurada"}
                {product.exam_year ? ` · Gestión ${product.exam_year}` : ""}
              </p>
              <Link className="button primary" href={`/dashboard?product=${product.slug}`}>
                Entrar <ArrowRight size={17} />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
