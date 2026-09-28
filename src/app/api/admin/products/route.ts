import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { createAcademicProduct, listAcademicProducts, productPayloadSchema } from "@/lib/products/products";

export async function GET() {
  await requireAdmin();
  const products = await listAcademicProducts({ includeInactive: true });
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  const profile = await requireAdmin();
  const body = await request.json().catch(() => null);
  const parsed = productPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  try {
    const created = await createAcademicProduct(parsed.data, profile.id);
    return NextResponse.json({ product: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el producto." },
      { status: 500 },
    );
  }
}
