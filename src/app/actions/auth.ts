"use server";
import { redirect } from "next/navigation";
import { isConfigured, usernameDomain } from "@/lib/config";
import { loginSchema, usernameToEmail, accessProblem } from "@/lib/auth/rules";
import { createSupabaseServer } from "@/lib/supabase/server";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { registerSingleDeviceSession } from "@/lib/auth/device-session";
import type { ActionState, Profile } from "@/lib/models";

export async function login(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!isConfigured())
    return {
      error:
        "El acceso estará disponible cuando se complete la configuración del sistema.",
    };
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: "Introduce un usuario válido y tu contraseña." };
  let destination = "/dashboard";
  try {
    const globalAllowed = await consumeLimit("login:global", 300, 60);
    const accountAllowed =
      globalAllowed &&
      (await consumeLimit(`login:${parsed.data.username}`, 8, 900));
    if (!accountAllowed)
      return {
        error:
          "Demasiados intentos. Espera unos minutos antes de volver a intentar.",
      };
    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(parsed.data.username, usernameDomain()),
      password: parsed.data.password,
    });
    if (error || !data.user)
      return { error: "Usuario o contraseña incorrectos." };
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();
    const problem = profile
      ? accessProblem(profile as Profile)
      : "Tu cuenta no tiene acceso habilitado. Contacta a tu administrador.";
    if (problem) {
      await supabase.auth.signOut();
      return { error: problem };
    }
    await registerSingleDeviceSession({
      profile: profile as Profile,
      accessToken: data.session?.access_token,
    });
    destination = profile.role === "ADMIN" ? "/admin" : "/dashboard";
    console.info(
      JSON.stringify({ event: "login_success", user_id: data.user.id }),
    );
  } catch {
    console.error(JSON.stringify({ event: "login_service_unavailable" }));
    return {
      error: "No se pudo conectar al servicio de acceso. Inténtalo más tarde.",
    };
  }
  redirect(destination);
}
export async function logout() {
  if (isConfigured()) {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut({ scope: "local" });
  }
  redirect("/login");
}
