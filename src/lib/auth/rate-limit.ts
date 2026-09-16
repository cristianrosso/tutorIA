import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function consumeLimit(
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const bucket = createHash("sha256").update(key).digest("hex");
  const { data, error } = await createSupabaseAdmin().rpc(
    "consume_rate_limit",
    {
      p_key: bucket,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    },
  );
  if (error) throw new Error("No se pudo verificar el límite de solicitudes.");
  return data === true;
}
