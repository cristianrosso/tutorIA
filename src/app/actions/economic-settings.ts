"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { updateEconomicSettings } from "@/lib/billing/economic-settings";

const schema = z.object({
  licenseDurationDays: z.coerce.number().int().min(1).max(365),
  monthlyStudentBudgetBob: z.coerce.number().min(1).max(10000),
  expectedStudents: z.coerce.number().int().min(1).max(100000),
  usdToBobRate: z.coerce.number().min(0.01).max(100),
  infrastructureMonthlyBob: z.coerce.number().min(0).max(1000000),
  voiceMonthlyBudgetBob: z.coerce.number().min(0).max(10000),
  voiceEnabled: z.string().optional(),
});

export async function saveEconomicSettings(
  _prev: { error?: string; success?: string },
  formData: FormData,
) {
  const profile = await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: "Revisa la configuración económica." };
  await updateEconomicSettings({
    ...parsed.data,
    voiceEnabled: parsed.data.voiceEnabled === "on",
    alertThresholds: [50, 75, 90, 100],
    updatedBy: profile.id,
  });
  revalidatePath("/admin/usage");
  return { success: "Configuración económica actualizada." };
}
