import Link from "next/link";
import { Settings } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AdminNav } from "@/components/admin/admin-nav";
import { EconomicSettingsForm } from "@/components/economic-settings-form";
import { requireAdmin } from "@/lib/auth/session";
import { getEconomicSettings } from "@/lib/billing/economic-settings";

export default async function AdminSettingsPage() {
  const profile = await requireAdmin();
  const settings = await getEconomicSettings();

  return (
    <AppShell profile={profile} active="admin">
      <AdminNav />
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONFIGURACIÓN OPERATIVA</span>
          <h1>Economía y licencias.</h1>
          <p>
            Ajusta duración mensual, presupuesto, tasa USD/BOB y límites de voz.
          </p>
        </div>
        <span className="badge">
          <Settings size={15} /> Sprint 17
        </span>
      </div>

      <section className="panel admin-section">
        <div className="section-heading">
          <h2>Modelo económico</h2>
          <span>No altera consumos históricos</span>
        </div>
        <EconomicSettingsForm settings={settings} />
      </section>

      <section className="panel admin-section">
        <h2>Accesos rápidos</h2>
        <div className="admin-actions">
          <Link className="button secondary" href="/admin/usage">
            Ver consumo IA
          </Link>
          <Link className="button secondary" href="/admin/licenses">
            Gestionar licencias
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
