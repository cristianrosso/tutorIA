import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/config";
import { createSupabaseServer } from "@/lib/supabase/server";
import { accessProblem } from "@/lib/auth/rules";
import type { Profile } from "@/lib/models";

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  if (!isConfigured()) return null;
  const supabase = await createSupabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (profileError) return null;
  return data as Profile;
});
export async function requireProfile() {
  if (!isConfigured()) redirect("/configuracion");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (accessProblem(profile)) redirect("/login?estado=sin-acceso");
  return profile;
}
export async function requireAdmin() {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/dashboard");
  return profile;
}

export async function requireStudent() {
  const profile = await requireProfile();
  if (profile.role !== "ESTUDIANTE") redirect("/admin");
  return profile;
}
