import { NextResponse } from "next/server";
import { getAdminLicenses } from "@/lib/admin/admin-service";
import { accessProblem } from "@/lib/auth/rules";
import { getCurrentProfile } from "@/lib/auth/session";

async function assertAdmin() {
  const profile = await getCurrentProfile();
  return profile && profile.role === "ADMIN" && !accessProblem(profile);
}

export async function GET() {
  if (!(await assertAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  return NextResponse.json(await getAdminLicenses());
}
