"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { createAcademicProduct, productPayloadSchema } from "@/lib/products/products";

export type ProductActionState = { error?: string; success?: string };

export async function createProductAction(
  _prev: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const profile = await requireAdmin();
  const parsed = productPayloadSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    shortName: formData.get("shortName"),
    institutionName: formData.get("institutionName"),
    examName: formData.get("examName"),
    examYear: formData.get("examYear") || null,
    status: formData.get("status") || "draft",
    primaryColor: formData.get("primaryColor"),
    accentColor: formData.get("accentColor"),
  });
  if (!parsed.success) return { error: z.prettifyError(parsed.error) };
  try {
    await createAcademicProduct(parsed.data, profile.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo crear el producto." };
  }
  revalidatePath("/admin/products");
  revalidatePath("/preparaciones");
  return { success: "Producto académico creado." };
}
