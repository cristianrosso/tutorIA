import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="error-page">
      <span className="eyebrow">404</span>
      <h1>Esta página no está en tu programa</h1>
      <p>Vuelve a tu aula para continuar.</p>
      <Link className="button primary" href="/dashboard">
        Volver a mi aula
      </Link>
    </main>
  );
}
