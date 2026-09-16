"use client";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="error-page">
      <h1>No pudimos cargar esta página</h1>
      <p>
        Comprueba la conexión y la configuración de Supabase. Tus datos no se
        han modificado.
      </p>
      <button className="button primary" onClick={reset}>
        Volver a intentar
      </button>
    </main>
  );
}
