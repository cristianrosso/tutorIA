import { BookOpenCheck, Boxes, Database, ShieldCheck } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";
import { AppShell } from "@/components/app-shell";
import { ProductCreateForm } from "@/components/products/product-create-form";
import { requireAdmin } from "@/lib/auth/session";
import { listAcademicProducts } from "@/lib/products/products";

export default async function AdminProductsPage() {
  const profile = await requireAdmin();
  const products = await listAcademicProducts({ includeInactive: true });
  const active = products.filter((product) => product.status === "active").length;
  const drafts = products.filter((product) => product.status === "draft").length;

  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading admin-hero">
        <div>
          <span className="eyebrow">SPRINT 22B · MULTI-CURSO</span>
          <h1>
            Productos académicos<span className="heading-dot">.</span>
          </h1>
          <p>
            Administra cursos, exámenes y bases de conocimiento sin mezclar fuentes entre productos.
          </p>
        </div>
        <span className="badge">
          <Boxes size={15} /> Multi-producto
        </span>
      </div>

      <div className="metrics-grid compact-metrics admin-metrics-grid">
        <article className="metric-card">
          <Boxes size={20} />
          <span>Productos</span>
          <strong>{products.length}</strong>
          <small>Incluye FATESCIPOL inicial</small>
        </article>
        <article className="metric-card">
          <ShieldCheck size={20} />
          <span>Activos</span>
          <strong>{active}</strong>
          <small>Disponibles para estudiantes</small>
        </article>
        <article className="metric-card">
          <BookOpenCheck size={20} />
          <span>Borradores</span>
          <strong>{drafts}</strong>
          <small>Preparados sin publicar</small>
        </article>
      </div>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Catálogo de productos</h2>
          <span>Aislamiento por producto desde base de datos y servicios</span>
        </div>
        <div className="admin-table product-table">
          <div className="admin-table-row header">
            <span>Producto</span>
            <span>Estado</span>
            <span>Institución</span>
            <span>Examen</span>
            <span>Identificador</span>
          </div>
          {products.map((product) => (
            <div className="admin-table-row" key={product.id}>
              <span>
                <strong>{product.name}</strong>
                <small>{product.short_name}</small>
              </span>
              <span className={`badge ${product.status === "active" ? "" : "neutral"}`}>
                {product.status}
              </span>
              <span>{product.institution_name || "Sin institución"}</span>
              <span>
                {product.exam_name || "Sin examen"}
                {product.exam_year ? <small>Gestión {product.exam_year}</small> : null}
              </span>
              <span>
                <code>{product.slug}</code>
                <small>{product.id}</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Crear nuevo producto</h2>
          <span>El contenido académico se cargará después desde Conocimiento</span>
        </div>
        <p className="notice success">
          Crear el producto no inventa unidades ni compendios. Primero queda como contenedor administrativo; luego se carga su fuente oficial y se publica al RAG con revisión.
        </p>
        <ProductCreateForm />
      </section>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Regla de aislamiento</h2>
          <span>Aplicada a RAG, licencias, consumo y analítica</span>
        </div>
        <p>
          Las consultas nuevas pueden recibir <code>product_id</code> o <code>product_slug</code>. Cuando se aplique la migración, las tablas académicas heredadas y MKF-1 quedarán etiquetadas con FATESCIPOL por defecto y los nuevos productos deberán publicar conocimiento con su propio identificador.
        </p>
        <div className="admin-actions">
          <a className="button secondary" href="/admin/knowledge">
            <Database size={18} /> Gestionar fuentes
          </a>
        </div>
      </section>
    </AppShell>
  );
}
