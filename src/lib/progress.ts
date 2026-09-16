import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function recordUnitProgress(input: {
  userId: string;
  unitId: string;
  questions?: number;
  practices?: number;
  simulations?: number;
  score?: number;
  weakTopics?: string[];
}) {
  const db = createSupabaseAdmin();
  const { data } = await db
    .from("unit_progress")
    .select("*")
    .eq("user_id", input.userId)
    .eq("unit_id", input.unitId)
    .maybeSingle();
  const current = (data || {}) as Record<string, unknown>;
  const scores = [
    Number(current.average_score || 0),
    ...(input.score == null ? [] : [input.score]),
  ];
  const totalScores =
    input.score == null
      ? Number(current.simulations_completed || 0)
      : Number(current.simulations_completed || 0) + 1;
  await db.from("unit_progress").upsert(
    {
      user_id: input.userId,
      unit_id: input.unitId,
      questions_asked:
        Number(current.questions_asked || 0) + (input.questions || 0),
      practice_attempts:
        Number(current.practice_attempts || 0) + (input.practices || 0),
      simulations_completed: totalScores,
      average_score: totalScores
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 0,
      weak_topics: input.weakTopics || current.weak_topics || [],
      last_activity_at: new Date().toISOString(),
      status: "en_estudio",
    },
    { onConflict: "user_id,unit_id" },
  );
}
