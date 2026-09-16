import "server-only";

export function publicSupabaseConfig() {
  // Variables exclusivamente de servidor, leídas al ejecutar la solicitud.
  // No llevan NEXT_PUBLIC_: Next fija esas variables al compilar.
  const runtimeEnv = process.env;
  const url = runtimeEnv.SUPABASE_URL;
  const key = runtimeEnv.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
  } catch {
    return null;
  }
  return { url, key };
}
export function isConfigured() {
  return Boolean(publicSupabaseConfig() && process.env.SUPABASE_SECRET_KEY);
}
export function usernameDomain() {
  return (
    process.env.AUTH_USERNAME_DOMAIN || "usuarios.tutor-fatescipol.invalid"
  );
}
