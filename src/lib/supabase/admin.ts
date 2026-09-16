import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "@/lib/config";

// Bypassa RLS: solo llamar después de requireAdmin(), salvo limitador de login.
export function createSupabaseAdmin() {
  const config = publicSupabaseConfig();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!config || !key)
    throw new Error("Configuración administrativa incompleta");
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
