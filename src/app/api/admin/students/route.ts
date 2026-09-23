import { NextResponse } from "next/server";
import { getAdminStudents } from "@/lib/admin/admin-service";
import { accessProblem } from "@/lib/auth/rules";
import { getCurrentProfile } from "@/lib/auth/session";

async function assertAdmin() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "ADMIN" && !accessProblem(profile);
}

export async function GET(request: Request) {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const url = new URL(request.url);
  return NextResponse.json(
    await getAdminStudents({
      query: url.searchParams.get("q") || undefined,
      status: url.searchParams.get("status") || "all",
      page: Number(url.searchParams.get("page") || 1),
    }),
  );
}
