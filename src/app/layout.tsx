import type { Metadata } from "next";
import "./globals.css";

// La configuración y la identidad se resuelven en cada solicitud, nunca en build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Tutor IA FATESCIPOL – Examen de Grado 2026",
    template: "%s | Tutor IA FATESCIPOL",
  },
  description:
    "Tu espacio de preparación para el Examen de Grado 2026. FATESCIPOL El Alto.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <a className="skip-link" href="#main">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
