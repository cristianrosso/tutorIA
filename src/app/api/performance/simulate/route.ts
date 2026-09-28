import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  scenario: z.string().trim().max(80).default("generic"),
  delayMs: z.coerce.number().int().min(0).max(15000).default(250),
  status: z.coerce.number().int().min(200).max(599).default(200),
  payloadKb: z.coerce.number().int().min(0).max(128).default(1),
  productId: z.uuid().nullable().optional(),
  productSlug: z.string().trim().max(80).optional(),
});

function enabledToken() {
  return process.env.PERFORMANCE_TEST_TOKEN?.trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const token = enabledToken();
  if (!token) return NextResponse.json({ error: "No disponible." }, { status: 404 });
  if (request.headers.get("x-performance-test-token") !== token) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  const productSlug = request.headers.get("x-academic-product-slug") || parsed.data.productSlug || "fatescipol-grado";
  const productId = request.headers.get("x-academic-product-id") || parsed.data.productId || null;
  const started = Date.now();
  await sleep(parsed.data.delayMs);
  const payload = "x".repeat(parsed.data.payloadKb * 1024);
  return NextResponse.json(
    {
      ok: parsed.data.status < 400,
      scenario: parsed.data.scenario,
      productSlug,
      productId,
      simulated: true,
      delayMs: parsed.data.delayMs,
      serverMs: Date.now() - started,
      payload,
    },
    {
      status: parsed.data.status,
      headers: {
        "Cache-Control": "no-store",
        "X-Performance-Simulated": "true",
      },
    },
  );
}
