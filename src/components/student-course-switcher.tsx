import Link from "next/link";
import { ArrowRight, BookOpenCheck, Boxes } from "lucide-react";
import type { AcademicProduct } from "@/lib/products/products";
import { withProduct } from "@/lib/products/selection";

export function StudentCourseSwitcher({
  products,
  activeProduct,
  basePath,
}: {
  products: AcademicProduct[];
  activeProduct: AcademicProduct;
  basePath: string;
}) {
  return (
    <section className="panel course-context-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">CURSO ACTIVO</span>
          <h2>{activeProduct.name}</h2>
          <span>
            {activeProduct.institution_name || "Institución no configurada"}
            {activeProduct.exam_year ? ` · Gestión ${activeProduct.exam_year}` : ""}
          </span>
        </div>
        <Link className="button secondary" href="/preparaciones">
          <Boxes size={16} /> Cambiar desde mis preparaciones
        </Link>
      </div>
      {products.length > 1 ? (
        <div className="course-chip-row" aria-label="Cursos disponibles">
          {products.map((product) => (
            <Link
              key={product.id}
              className={`course-chip ${product.id === activeProduct.id ? "active" : ""}`}
              href={withProduct(basePath, product)}
            >
              <BookOpenCheck size={15} />
              <span>{product.short_name}</span>
              {product.id === activeProduct.id ? <strong>Actual</strong> : <ArrowRight size={14} />}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
