import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminStudents } from "@/lib/admin/admin-service";
import { accessProblem } from "@/lib/auth/rules";
import { getCurrentProfile } from "@/lib/auth/session";

const studentsQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(["all", "active", "pending", "expired", "suspended"]).default("all"),
  page: z.coerce.number().int().min(1).max(200).default(1),
});

async function assertAdmin() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "ADMIN" && !accessProblem(profile);
}

export async function GET(request: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const url = new URL(request.url);
  const parsed = studentsQuerySchema.safeParse({
    q: url.searchParams.get("q") || undefined,
    status: url.searchParams.get("status") || "all",
    page: url.searchParams.get("page") || "1",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }
  return NextResponse.json(await getAdminStudents(parsed.data));
}
