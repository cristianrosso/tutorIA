import "server-only";

import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { Profile } from "@/lib/models";

export const DEFAULT_PRODUCT_SLUG = "fatescipol-grado";
export const DEFAULT_PRODUCT_ID = "00000000-0000-4000-8000-000000000101";

export type AcademicProduct = {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  institution_name: string | null;
  exam_name: string | null;
  exam_year: number | null;
  status: "draft" | "active" | "archived" | "suspended";
  settings: Record<string, unknown>;
  branding: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type ProductLicense = {
  id: string;
  user_id: string;
  product_id: string;
  status: "pending" | "active" | "expired" | "suspended" | "cancelled";
  starts_at: string;
  expires_at: string | null;
  academic_products?: AcademicProduct | AcademicProduct[] | null;
};

export const productSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Usa minúsculas, números y guiones.");

export const productPayloadSchema = z.object({
  slug: productSlugSchema,
  name: z.string().trim().min(3).max(140),
  shortName: z.string().trim().min(2).max(40),
  institutionName: z.string().trim().max(140).optional().nullable(),
  examName: z.string().trim().max(140).optional().nullable(),
  examYear: z.coerce.number().int().min(2000).max(2100).optional().nullable(),
  status: z.enum(["draft", "active", "archived", "suspended"]).default("draft"),
  primaryColor: z.string().trim().max(24).optional().nullable(),
  accentColor: z.string().trim().max(24).optional().nullable(),
});

export function defaultProduct(): AcademicProduct {
  return {
    id: DEFAULT_PRODUCT_ID,
    slug: DEFAULT_PRODUCT_SLUG,
    name: "FATESCIPOL — Examen de Grado 2026",
    short_name: "FATESCIPOL",
    institution_name: "FATESCIPOL El Alto",
    exam_name: "Examen de Grado",
    exam_year: 2026,
    status: "active",
    settings: { default_unit_count: 15, default_language: "es-BO" },
    branding: { primary_color: "#0f766e", accent_color: "#e9c46a" },
  };
}

function productFromRelation(value: ProductLicense["academic_products"]) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

function isMissingProductTable(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "42P01" || message.includes("academic_products") || message.includes("user_product_licenses");
}

export async function listAcademicProducts({ includeInactive = true } = {}) {
  const db = createSupabaseAdmin();
  let query = db
    .from("academic_products")
    .select("id,slug,name,short_name,institution_name,exam_name,exam_year,status,settings,branding,created_at,updated_at")
    .order("created_at", { ascending: true });
  if (!includeInactive) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) {
    if (isMissingProductTable(error)) return [defaultProduct()];
    throw new Error(error.message);
  }
  return (data?.length ? data : [defaultProduct()]) as AcademicProduct[];
}

export async function getProductBySlug(slug?: string | null) {
  const cleanSlug = slug ? productSlugSchema.catch(DEFAULT_PRODUCT_SLUG).parse(slug) : DEFAULT_PRODUCT_SLUG;
  if (cleanSlug === DEFAULT_PRODUCT_SLUG) {
    try {
      const db = createSupabaseAdmin();
      const { data, error } = await db
        .from("academic_products")
        .select("id,slug,name,short_name,institution_name,exam_name,exam_year,status,settings,branding,created_at,updated_at")
        .eq("slug", cleanSlug)
        .maybeSingle();
      if (error && !isMissingProductTable(error)) throw new Error(error.message);
      return (data as AcademicProduct | null) || defaultProduct();
    } catch {
      return defaultProduct();
    }
  }
  const db = createSupabaseAdmin();
  const { data, error } = await db
    .from("academic_products")
    .select("id,slug,name,short_name,institution_name,exam_name,exam_year,status,settings,branding,created_at,updated_at")
    .eq("slug", cleanSlug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as AcademicProduct | null;
}

export async function listProductsForUser(profile: Profile) {
  if (profile.role === "ADMIN") return listAcademicProducts({ includeInactive: true });
  const db = await createSupabaseServer();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("user_product_licenses")
    .select("id,user_id,product_id,status,starts_at,expires_at,academic_products(id,slug,name,short_name,institution_name,exam_name,exam_year,status,settings,branding,created_at,updated_at)")
    .eq("user_id", profile.id)
    .eq("status", "active")
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingProductTable(error)) return [defaultProduct()];
    throw new Error(error.message);
  }
  const products = ((data || []) as ProductLicense[])
    .map((license) => productFromRelation(license.academic_products))
    .filter((product): product is AcademicProduct => Boolean(product));
  return products.length ? products : [defaultProduct()];
}

export async function userCanAccessProduct(profile: Profile, productId: string) {
  if (profile.role === "ADMIN") return true;
  if (productId === DEFAULT_PRODUCT_ID) return true;
  const db = createSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("user_product_licenses")
    .select("id")
    .eq("user_id", profile.id)
    .eq("product_id", productId)
    .eq("status", "active")
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1);
  if (error) {
    if (isMissingProductTable(error)) return productId === DEFAULT_PRODUCT_ID;
    throw new Error(error.message);
  }
  return Boolean(data?.length);
}

export async function createAcademicProduct(input: z.infer<typeof productPayloadSchema>, actorId: string) {
  const parsed = productPayloadSchema.parse(input);
  const db = createSupabaseAdmin();
  const payload = {
    slug: parsed.slug,
    name: parsed.name,
    short_name: parsed.shortName,
    institution_name: parsed.institutionName || null,
    exam_name: parsed.examName || null,
    exam_year: parsed.examYear || null,
    status: parsed.status,
    branding: {
      primary_color: parsed.primaryColor || "#0f766e",
      accent_color: parsed.accentColor || "#e9c46a",
    },
    settings: { default_language: "es-BO" },
    created_by: actorId,
  };
  const { data, error } = await db.from("academic_products").insert(payload).select("id").single();
  if (error) throw new Error(error.message);
  return data as { id: string };
}

export async function updateAcademicProduct(id: string, input: Partial<z.infer<typeof productPayloadSchema>>) {
  const parsed = productPayloadSchema.partial().parse(input);
  const patch: Record<string, unknown> = {};
  if (parsed.slug) patch.slug = parsed.slug;
  if (parsed.name) patch.name = parsed.name;
  if (parsed.shortName) patch.short_name = parsed.shortName;
  if (parsed.institutionName !== undefined) patch.institution_name = parsed.institutionName || null;
  if (parsed.examName !== undefined) patch.exam_name = parsed.examName || null;
  if (parsed.examYear !== undefined) patch.exam_year = parsed.examYear || null;
  if (parsed.status) patch.status = parsed.status;
  if (parsed.primaryColor || parsed.accentColor) {
    patch.branding = {
      primary_color: parsed.primaryColor || "#0f766e",
      accent_color: parsed.accentColor || "#e9c46a",
    };
  }
  const { error } = await createSupabaseAdmin().from("academic_products").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function assignProductLicense(input: {
  userId: string;
  productId: string;
  actorId: string;
  startsAt: string;
  expiresAt: string | null;
  status?: "pending" | "active" | "expired" | "suspended" | "cancelled";
  source?: string;
}) {
  try {
    const { error } = await createSupabaseAdmin().from("user_product_licenses").insert({
      user_id: input.userId,
      product_id: input.productId,
      status: input.status || "active",
      starts_at: input.startsAt,
      expires_at: input.expiresAt,
      license_type: "monthly",
      created_by: input.actorId,
      metadata: { source: input.source || "admin_panel" },
    });
    if (error) throw new Error(error.message);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("user_product_licenses") || message.includes("product_id")) return;
    throw error;
  }
}
