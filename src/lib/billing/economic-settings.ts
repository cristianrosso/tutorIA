import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type EconomicSettings = {
  licenseDurationDays: number;
  monthlyStudentBudgetBob: number;
  expectedStudents: number;
  usdToBobRate: number;
  infrastructureMonthlyBob: number;
  voiceEnabled: boolean;
  voiceMonthlyBudgetBob: number;
  alertThresholds: number[];
};

const fallbackSettings: EconomicSettings = {
  licenseDurationDays: Number(
    process.env.STUDENT_LICENSE_DURATION_DAYS || "40",
  ),
  monthlyStudentBudgetBob: Number(
    process.env.STUDENT_PERIOD_BUDGET_BOB || "40",
  ),
  expectedStudents: Number(process.env.EXPECTED_STUDENTS || "400"),
  usdToBobRate: Number(process.env.USD_TO_BOB_ACCOUNTING_RATE || "6.96"),
  infrastructureMonthlyBob: Number(
    process.env.INFRASTRUCTURE_MONTHLY_BOB || "0",
  ),
  voiceEnabled: process.env.VOICE_ENABLED !== "false",
  voiceMonthlyBudgetBob: Number(process.env.VOICE_MONTHLY_BUDGET_BOB || "10"),
  alertThresholds: [50, 75, 90, 100],
};

export async function getEconomicSettings(): Promise<EconomicSettings> {
  try {
    const { data, error } = await createSupabaseAdmin()
      .from("economic_settings")
      .select(
        "license_duration_days,monthly_student_budget_bob,expected_students,usd_to_bob_rate,infrastructure_monthly_bob,voice_enabled,voice_monthly_budget_bob,alert_thresholds",
      )
      .eq("id", "default")
      .maybeSingle();
    if (error || !data) return fallbackSettings;
    return {
      licenseDurationDays: Number(
        data.license_duration_days || fallbackSettings.licenseDurationDays,
      ),
      monthlyStudentBudgetBob: Number(
        data.monthly_student_budget_bob ||
          fallbackSettings.monthlyStudentBudgetBob,
      ),
      expectedStudents: Number(
        data.expected_students || fallbackSettings.expectedStudents,
      ),
      usdToBobRate: Number(
        data.usd_to_bob_rate || fallbackSettings.usdToBobRate,
      ),
      infrastructureMonthlyBob: Number(data.infrastructure_monthly_bob || 0),
      voiceEnabled: Boolean(data.voice_enabled),
      voiceMonthlyBudgetBob: Number(data.voice_monthly_budget_bob || 0),
      alertThresholds: Array.isArray(data.alert_thresholds)
        ? data.alert_thresholds
            .map(Number)
            .filter((item) => Number.isFinite(item) && item > 0)
        : fallbackSettings.alertThresholds,
    };
  } catch {
    return fallbackSettings;
  }
}

export async function updateEconomicSettings(
  input: EconomicSettings & { updatedBy: string },
) {
  const { error } = await createSupabaseAdmin()
    .from("economic_settings")
    .upsert({
      id: "default",
      license_duration_days: input.licenseDurationDays,
      monthly_student_budget_bob: input.monthlyStudentBudgetBob,
      expected_students: input.expectedStudents,
      usd_to_bob_rate: input.usdToBobRate,
      infrastructure_monthly_bob: input.infrastructureMonthlyBob,
      voice_enabled: input.voiceEnabled,
      voice_monthly_budget_bob: input.voiceMonthlyBudgetBob,
      alert_thresholds: input.alertThresholds,
      updated_by: input.updatedBy,
    });
  if (error) throw new Error("No se pudo guardar la configuración económica.");
}

export function budgetLevel(percent: number) {
  if (percent >= 100) return "critical" as const;
  if (percent >= 90) return "danger" as const;
  if (percent >= 75) return "warning" as const;
  if (percent >= 50) return "notice" as const;
  return "ok" as const;
}
