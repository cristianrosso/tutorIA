import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/auth/session";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { createExam } from "@/lib/exams/exam-service";
import { userCanAccessProduct } from "@/lib/products/products";

export async function POST(request: Request) {
  try {
    const profile = await requireStudent();
    const allowed = await consumeLimit(`exam-create:${profile.id}`, 12, 3600);
    if (!allowed) return NextResponse.json({ error: "Alcanzaste el límite de simulacros por hora. Intenta nuevamente más tarde." }, { status: 429 });
    const body = await request.json();
    if (body?.productId && !(await userCanAccessProduct(profile, body.productId))) {
      return NextResponse.json({ error: "No tienes acceso a ese curso." }, { status: 403 });
    }
    const examId = await createExam(profile, body);
    return NextResponse.json({ examId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear el simulacro." }, { status: 400 });
  }
}
