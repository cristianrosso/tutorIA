"use client";

import { useActionState } from "react";
import { saveEconomicSettings } from "@/app/actions/economic-settings";
import type { EconomicSettings } from "@/lib/billing/economic-settings";

const initialState: { error?: string; success?: string } = {};

export function EconomicSettingsForm({
  settings,
}: {
  settings: EconomicSettings;
}) {
  const [state, action, pending] = useActionState(
    saveEconomicSettings,
    initialState,
  );
  return (
    <form action={action} className="admin-form">
      <div className="form-grid compact">
        <label>
          Duración licencia (días)
          <input
            name="licenseDurationDays"
            type="number"
            min={1}
            max={365}
            defaultValue={settings.licenseDurationDays}
          />
        </label>
        <label>
          Presupuesto objetivo por estudiante (Bs/mes)
          <input
            name="monthlyStudentBudgetBob"
            type="number"
            min={1}
            step="0.01"
            defaultValue={settings.monthlyStudentBudgetBob}
          />
        </label>
        <label>
          Estudiantes previstos
          <input
            name="expectedStudents"
            type="number"
            min={1}
            defaultValue={settings.expectedStudents}
          />
        </label>
        <label>
          Tasa USD a BOB
          <input
            name="usdToBobRate"
            type="number"
            min={0.01}
            step="0.0001"
            defaultValue={settings.usdToBobRate}
          />
        </label>
        <label>
          Infraestructura mensual total (Bs)
          <input
            name="infrastructureMonthlyBob"
            type="number"
            min={0}
            step="0.01"
            defaultValue={settings.infrastructureMonthlyBob}
          />
        </label>
        <label>
          Presupuesto mensual de voz (Bs/estudiante)
          <input
            name="voiceMonthlyBudgetBob"
            type="number"
            min={0}
            step="0.01"
            defaultValue={settings.voiceMonthlyBudgetBob}
          />
        </label>
      </div>
      <label className="checkbox-label">
        <input
          name="voiceEnabled"
          type="checkbox"
          defaultChecked={settings.voiceEnabled}
        />
        Habilitar funcionalidades de voz dentro del presupuesto disponible
      </label>
      <button className="button primary" disabled={pending}>
        Guardar configuración económica
      </button>
      {state.error ? <p className="notice error">{state.error}</p> : null}
      {state.success ? <p className="notice success">{state.success}</p> : null}
    </form>
  );
}
