import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/models";

type JwtPayload = {
  session_id?: string;
  sid?: string;
};

export function authSessionIdFromAccessToken(accessToken?: string | null) {
  if (!accessToken) return null;
  const [, payload] = accessToken.split(".");
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(normalized, "base64").toString("utf8");
    const parsed = JSON.parse(json) as JwtPayload;
    return parsed.session_id || parsed.sid || null;
  } catch {
    return null;
  }
}

export async function registerSingleDeviceSession(input: {
  profile: Pick<Profile, "id" | "role">;
  accessToken?: string | null;
}) {
  if (input.profile.role !== "ESTUDIANTE") return;
  const authSessionId = authSessionIdFromAccessToken(input.accessToken);
  if (!authSessionId)
    throw new Error("No se pudo identificar la sesión activa.");
  const db = createSupabaseAdmin();
  const { error: revokeError } = await db
    .from("access_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", input.profile.id)
    .is("revoked_at", null)
    .neq("auth_session_id", authSessionId);
  if (revokeError)
    throw new Error("No se pudo limitar el acceso a un dispositivo.");

  const { error: upsertError } = await db.from("access_sessions").upsert(
    {
      user_id: input.profile.id,
      auth_session_id: authSessionId,
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "auth_session_id" },
  );
  if (upsertError)
    throw new Error("No se pudo registrar el dispositivo activo.");
}

export async function isSingleDeviceSessionActive(input: {
  profile: Pick<Profile, "id" | "role">;
  accessToken?: string | null;
}) {
  if (input.profile.role !== "ESTUDIANTE") return true;
  const authSessionId = authSessionIdFromAccessToken(input.accessToken);
  if (!authSessionId) return false;
  const { data, error } = await createSupabaseAdmin()
    .from("access_sessions")
    .select("id,revoked_at")
    .eq("user_id", input.profile.id)
    .eq("auth_session_id", authSessionId)
    .maybeSingle();
  if (error || !data || data.revoked_at) return false;
  await createSupabaseAdmin()
    .from("access_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", data.id);
  return true;
}
