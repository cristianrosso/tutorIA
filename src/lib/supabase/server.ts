import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicSupabaseConfig } from "@/lib/config";

export async function createSupabaseServer() {
  const config = publicSupabaseConfig();
  if (!config) throw new Error("Supabase no configurado");
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* Los Server Components no escriben cookies; proxy.ts las renueva. */
        }
      },
    },
  });
}
