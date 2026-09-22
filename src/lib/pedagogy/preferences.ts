import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { PedagogicalStrategy, TutorMode } from "@/lib/pedagogy/types";
import { canonicalTutorMode } from "@/lib/pedagogy/types";

export async function getPedagogicalPreference(userId: string) {
  const { data, error } = await createSupabaseAdmin()
    .from("student_pedagogical_preferences")
    .select("preferred_mode,metadata")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { preferredMode: null, metadata: {} };
  return {
    preferredMode: data?.preferred_mode
      ? canonicalTutorMode(data.preferred_mode as TutorMode)
      : null,
    metadata: (data?.metadata as Record<string, unknown> | null) || {},
  };
}

export async function savePedagogicalPreference(input: {
  userId: string;
  preferredMode: TutorMode;
  reason: string;
}) {
  const mode = canonicalTutorMode(input.preferredMode);
  const { error } = await createSupabaseAdmin()
    .from("student_pedagogical_preferences")
    .upsert(
      {
        user_id: input.userId,
        preferred_mode: mode,
        metadata: {
          reason: input.reason,
          updatedBy: "tutor",
          updatedAt: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (error) return false;
  return true;
}

export async function recordPedagogicalInteraction(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  mode: TutorMode;
  strategy: PedagogicalStrategy;
  reformulationRequested: boolean;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await createSupabaseAdmin()
    .from("pedagogical_interactions")
    .insert({
      user_id: input.userId,
      conversation_id: input.conversationId,
      message_id: input.messageId,
      mode: input.mode,
      strategy: input.strategy,
      reformulation_requested: input.reformulationRequested,
      metadata: input.metadata || {},
    });
  return !error;
}
