import { GraduationCap } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SimulationPanel } from "@/components/simulation-panel";
import { requireStudent } from "@/lib/auth/session";
import { getUnitByNumber } from "@/lib/data";
import { readLatestSimulation } from "@/lib/simulations/oral-exam";

export default async function SimulacroPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string }>;
}) {
  const profile = await requireStudent();
  const params = await searchParams;
  const unitNumber = Math.min(15, Math.max(1, Number(params.unit) || 1));
  const unit = await getUnitByNumber(unitNumber);
  const simulation = await readLatestSimulation(profile).catch(() => null);
  return (
    <AppShell profile={profile} active="simulacro">
      <div className="page-heading">
        <div>
          <span className="eyebrow">SIMULACRO ORAL POR UNIDAD</span>
          <h1>
            Simulacro<span className="heading-dot">.</span>
          </h1>
          <p>
            Practica con preguntas, repreguntas y retroalimentación basadas en
            Unidad {unit.number}, {unit.name}.
          </p>
        </div>
        <span className="badge">
          <GraduationCap size={15} /> Unidad {unit.number}
        </span>
      </div>
      <SimulationPanel
        initialSimulation={
          simulation?.unit_number === unit.number ? simulation : null
        }
        unit={unit}
      />
    </AppShell>
  );
}
