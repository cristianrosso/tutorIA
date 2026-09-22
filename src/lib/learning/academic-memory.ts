import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { KnowledgeChunkCandidate } from "@/lib/knowledge/types";

export type LearningEventType =
  | "topic_viewed"
  | "topic_studied"
  | "explanation_requested"
  | "example_requested"
  | "review_requested"
  | "practice_question_answered"
  | "study_session_started"
  | "study_session_completed";

export type LearningSource = Pick<
  KnowledgeChunkCandidate,
  "knowledgeObjectId" | "unitId" | "topicId" | "unitNumber" | "unitName" | "topicName" | "sectionName" | "finalScore"
>;

export async function ensureStudentAcademicProfile(userId: string) {
  const db = createSupabaseAdmin();
  const { data, error } = await db
    .from("student_academic_profiles")
    .upsert({ user_id: userId }, { onConflict: "user_id" })
    .select("id,user_id,preferred_learning_mode,current_unit_id,current_topic_id,last_studied_at")
    .single();
  if (error || !data) throw new Error("No se pudo preparar el perfil académico.");
  return data;
}

export async function recordLearningEvent(input: {
  userId: string;
  operationId: string;
  eventType: LearningEventType;
  source?: LearningSource | null;
  conversationId?: string | null;
  messageId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const db = createSupabaseAdmin();
  await ensureStudentAcademicProfile(input.userId);
  const payload = {
    user_id: input.userId,
    operation_id: input.operationId,
    event_type: input.eventType,
    knowledge_object_id: input.source?.knowledgeObjectId || null,
    unit_id: input.source?.unitId || null,
    topic_id: input.source?.topicId || null,
    conversation_id: input.conversationId || null,
    message_id: input.messageId || null,
    metadata: input.metadata || {},
  };
  const { error } = await db
    .from("student_learning_events")
    .upsert(payload, { onConflict: "operation_id", ignoreDuplicates: true });
  if (error) throw new Error("No se pudo registrar la actividad académica.");
}

export async function updateTopicProgress(input: {
  userId: string;
  source: LearningSource;
  eventType: LearningEventType;
}) {
  if (!input.source.knowledgeObjectId) return;
  const db = createSupabaseAdmin();
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from("student_topic_progress")
    .select("id,study_sessions_count,practice_attempts,correct_answers,incorrect_answers,status")
    .eq("user_id", input.userId)
    .eq("knowledge_object_id", input.source.knowledgeObjectId)
    .maybeSingle();

  const isPractice = input.eventType === "practice_question_answered";
  const nextStatus = existing?.status === "review_needed" ? "review_needed" : "in_progress";
  const payload = {
    user_id: input.userId,
    knowledge_object_id: input.source.knowledgeObjectId,
    unit_id: input.source.unitId || null,
    topic_id: input.source.topicId || null,
    status: nextStatus,
    first_studied_at: existing ? undefined : now,
    last_studied_at: now,
    study_sessions_count: Number(existing?.study_sessions_count || 0) + 1,
    practice_attempts: Number(existing?.practice_attempts || 0) + (isPractice ? 1 : 0),
  };

  if (existing?.id) {
    const { error } = await db
      .from("student_topic_progress")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error("No se pudo actualizar el progreso académico.");
  } else {
    const { error } = await db.from("student_topic_progress").insert(payload);
    if (error) throw new Error("No se pudo crear el progreso académico.");
  }
}

export async function recordSourcesAsLearning(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  sources: LearningSource[];
  intent: string;
  tutorMode: string;
}) {
  const relevant = selectRelevantSources(input.sources);
  await ensureStudentAcademicProfile(input.userId);
  await Promise.all(
    relevant.map(async (source, index) => {
      const eventType = eventTypeFor(input.intent, input.tutorMode);
      await recordLearningEvent({
        userId: input.userId,
        operationId: `${input.messageId}:${source.knowledgeObjectId || source.topicId || source.unitId || index}:${eventType}`,
        eventType,
        source,
        conversationId: input.conversationId,
        messageId: input.messageId,
        metadata: {
          intent: input.intent,
          tutorMode: input.tutorMode,
          relevanceScore: source.finalScore,
          unitNumber: source.unitNumber,
          unitName: source.unitName,
          topicName: source.topicName,
          sectionName: source.sectionName,
        },
      });
      await updateTopicProgress({ userId: input.userId, source, eventType });
    }),
  );
  const primary = relevant[0];
  await createSupabaseAdmin()
    .from("student_academic_profiles")
    .update({
      current_unit_id: primary?.unitId || null,
      current_topic_id: primary?.topicId || null,
      last_studied_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId);
}

export async function getRecentStudiedTopics(userId: string, limit = 5) {
  const { data } = await createSupabaseAdmin()
    .from("student_learning_events")
    .select("created_at,metadata,knowledge_object_id,unit_id,topic_id,academic_units(unit_number,unit_name),academic_topics(topic_number,topic_name)")
    .eq("user_id", userId)
    .not("topic_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  const seen = new Set<string>();
  return (data || [])
    .filter((row) => {
      const key = String(row.topic_id || row.knowledge_object_id || row.created_at);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export async function getTopicsNeedingReview(userId: string, limit = 5) {
  const { data } = await createSupabaseAdmin()
    .from("student_topic_progress")
    .select("knowledge_object_id,status,incorrect_answers,practice_attempts,last_studied_at,academic_units(unit_number,unit_name),academic_topics(topic_number,topic_name)")
    .eq("user_id", userId)
    .eq("status", "review_needed")
    .order("last_studied_at", { ascending: false })
    .limit(limit);
  return data || [];
}

export async function getCurrentLearningContext(userId: string) {
  const db = createSupabaseAdmin();
  const [{ data: profile }, recent, review] = await Promise.all([
    db
      .from("student_academic_profiles")
      .select("current_unit_id,current_topic_id,last_studied_at,academic_units(unit_number,unit_name),academic_topics(topic_number,topic_name)")
      .eq("user_id", userId)
      .maybeSingle(),
    getRecentStudiedTopics(userId, 4),
    getTopicsNeedingReview(userId, 4),
  ]);
  return { profile, recent, review };
}

export async function getStudentLearningSummary(userId: string) {
  const db = createSupabaseAdmin();
  await ensureStudentAcademicProfile(userId);
  const [{ data: profile }, { data: unitRows }, { data: progressRows }, { data: evidenceRows }, recent, review] =
    await Promise.all([
      db
        .from("student_academic_profiles")
        .select("current_unit_id,current_topic_id,last_studied_at,academic_units(unit_number,unit_name),academic_topics(topic_number,topic_name)")
        .eq("user_id", userId)
        .single(),
      db
        .from("academic_topics")
        .select("id,academic_unit_id,academic_units(id,unit_number,unit_name)"),
      db
        .from("student_topic_progress")
        .select("id,unit_id,topic_id,status,practice_attempts,correct_answers,incorrect_answers,last_studied_at")
        .eq("user_id", userId),
      db
        .from("student_learning_evidence")
        .select("result,score,max_score,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
      getRecentStudiedTopics(userId, 8),
      getTopicsNeedingReview(userId, 8),
    ]);

  const byUnit = buildUnitCoverage(unitRows || [], progressRows || []);
  const correct = (evidenceRows || []).filter((row) => row.result === "correct").length;
  const incorrect = (evidenceRows || []).filter((row) => row.result === "incorrect").length;
  const totalEvaluated = correct + incorrect;
  return {
    profile,
    units: byUnit,
    recent,
    review,
    evaluated: {
      attempts: totalEvaluated,
      correct,
      incorrect,
      observedAccuracy: totalEvaluated ? Math.round((correct / totalEvaluated) * 100) : null,
    },
  };
}

export async function getResumeStudySuggestion(userId: string) {
  const memory = await getCurrentLearningContext(userId);
  const topic = Array.isArray(memory.profile?.academic_topics)
    ? memory.profile?.academic_topics[0]
    : memory.profile?.academic_topics;
  const unit = Array.isArray(memory.profile?.academic_units)
    ? memory.profile?.academic_units[0]
    : memory.profile?.academic_units;
  if (!topic && !unit) {
    return {
      label: "Selecciona una unidad para comenzar",
      href: "/unidades",
      description: "Todavía no registras actividades académicas.",
    };
  }
  return {
    label: "Continuar estudiando",
    href: `/tutor?unit=${unit?.unit_number || 1}`,
    description: topic?.topic_name
      ? `Último tema trabajado: ${topic.topic_name}`
      : `Última unidad trabajada: ${unit?.unit_name || "Unidad registrada"}`,
  };
}

function selectRelevantSources(sources: LearningSource[]) {
  const seen = new Set<string>();
  return sources
    .filter((source) => source.finalScore >= 0.12 && (source.knowledgeObjectId || source.topicId || source.unitId))
    .filter((source) => {
      const key = source.knowledgeObjectId || source.topicId || source.unitId || "";
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

function eventTypeFor(intent: string, mode: string): LearningEventType {
  if (mode === "example" || intent === "example") return "example_requested";
  if (mode === "review" || intent === "exam_question") return "review_requested";
  if (["definition", "explanation", "general_question", "comparison", "procedure", "enumeration"].includes(intent)) {
    return "explanation_requested";
  }
  return "topic_studied";
}

type UnitRow = { id: string; academic_unit_id: string; academic_units?: { id: string; unit_number: number; unit_name: string } | { id: string; unit_number: number; unit_name: string }[] };
type ProgressRow = { unit_id: string | null; topic_id: string | null; status: string; practice_attempts: number; correct_answers: number; incorrect_answers: number; last_studied_at: string };

function buildUnitCoverage(unitRows: UnitRow[], progressRows: ProgressRow[]) {
  const totals = new Map<string, { unitId: string; unitNumber: number; unitName: string; total: number; studied: Set<string>; last: string | null }>();
  for (const row of unitRows) {
    const unit = Array.isArray(row.academic_units) ? row.academic_units[0] : row.academic_units;
    if (!unit) continue;
    const entry = totals.get(unit.id) || {
      unitId: unit.id,
      unitNumber: Number(unit.unit_number),
      unitName: String(unit.unit_name),
      total: 0,
      studied: new Set<string>(),
      last: null,
    };
    entry.total += 1;
    totals.set(unit.id, entry);
  }
  for (const row of progressRows) {
    if (!row.unit_id) continue;
    const entry = totals.get(row.unit_id);
    if (!entry) continue;
    if (row.topic_id) entry.studied.add(row.topic_id);
    if (!entry.last || Date.parse(row.last_studied_at) > Date.parse(entry.last)) entry.last = row.last_studied_at;
  }
  return [...totals.values()]
    .sort((a, b) => a.unitNumber - b.unitNumber)
    .map((entry) => ({
      unitId: entry.unitId,
      unitNumber: entry.unitNumber,
      unitName: entry.unitName,
      totalTopics: entry.total,
      studiedTopics: entry.studied.size,
      coveragePercent: entry.total ? Math.round((entry.studied.size / entry.total) * 100) : 0,
      lastStudiedAt: entry.last,
    }));
}
