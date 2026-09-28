import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { productPayloadSchema, updateAcademicProduct } from "@/lib/products/products";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAdmin();
  const { id } = await params;
  const productId = z.uuid().safeParse(id);
  if (!productId.success) return NextResponse.json({ error: "Producto inválido." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const parsed = productPayloadSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  try {
    await updateAcademicProduct(productId.data, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar el producto." },
      { status: 500 },
    );
  }
}
