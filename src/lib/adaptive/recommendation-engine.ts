import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  groupEvidenceByScope,
  collectStudentEvidence,
} from "@/lib/adaptive/evidence";
import { identifyGapsFromGroupedEvidence } from "@/lib/adaptive/learning-gaps";
import { estimateMasteryFromEvidence } from "@/lib/adaptive/mastery-estimator";
import {
  ADAPTIVE_CALCULATION_VERSION,
  adaptiveScopeKey,
  type AdaptiveRecommendation,
  type LearningGap,
  type MasteryEstimate,
  type RecommendationStatus,
} from "@/lib/adaptive/types";

export async function estimateStudentMastery(
  userId: string,
): Promise<MasteryEstimate[]> {
  const groups = groupEvidenceByScope(await collectStudentEvidence(userId));
  const estimates = groups.map(estimateMasteryFromEvidence);
  await Promise.all(
    estimates.map((estimate) => persistMastery(userId, estimate)),
  );
  return estimates.sort((a, b) => b.evidenceCount - a.evidenceCount);
}

export async function identifyLearningGaps(userId: string) {
  const groups = groupEvidenceByScope(await collectStudentEvidence(userId));
  const gaps = identifyGapsFromGroupedEvidence(groups).filter(
    (gap) => gap.gapType !== "NO_GAP",
  );
  await Promise.all(gaps.map((gap) => persistMastery(userId, gap.estimate)));
  return gaps;
}

export async function generateLearningRecommendations(input: {
  userId: string;
  limit?: number;
}) {
  const db = createSupabaseAdmin();
  const userId = input.userId;
  const gaps = await identifyLearningGaps(userId);
  const generated = gaps
    .flatMap((gap) => recommendationCandidates(gap))
    .slice(0, Math.max(input.limit || 5, 1));
  if (!generated.length) {
    const start = await buildStartRecommendation();
    if (start) generated.push(start);
  }
  const persisted = await Promise.all(
    generated.map((recommendation) =>
      persistRecommendation(userId, recommendation),
    ),
  );
  const rows = persisted.filter(Boolean) as AdaptiveRecommendation[];
  const enriched = await enrichRecommendations(
    rows.length
      ? rows
      : await readActiveRecommendations(userId, input.limit || 5),
  );
  await db.from("adaptive_learning_events").insert(
    enriched.slice(0, input.limit || 5).map((item) => ({
      user_id: userId,
      recommendation_id: item.id || null,
      knowledge_object_id: item.knowledgeObjectId,
      topic_id: item.topicId,
      unit_id: item.unitId,
      event_type: "recommendation_generated",
      updated_mastery:
        typeof item.evidenceSnapshot.masteryScore === "number"
          ? item.evidenceSnapshot.masteryScore
          : null,
      metadata: {
        reasonCode: item.reasonCode,
        calculationVersion: ADAPTIVE_CALCULATION_VERSION,
      },
    })),
  );
  return enriched.slice(0, input.limit || 5);
}

export async function getAdaptiveDashboard(userId: string) {
  const [mastery, gaps, recommendations] = await Promise.all([
    estimateStudentMastery(userId),
    identifyLearningGaps(userId),
    generateLearningRecommendations({ userId, limit: 5 }),
  ]);
  return { mastery, gaps, recommendations };
}

export async function buildAdaptiveTutorContext(input: {
  userId: string;
  limit?: number;
}) {
  const recommendations = await generateLearningRecommendations({
    userId: input.userId,
    limit: input.limit || 3,
  }).catch(() => []);
  if (!recommendations.length)
    return "Sin recomendaciones adaptativas suficientes todavía.";
  return recommendations
    .map((item, index) => {
      const target =
        item.topicName ||
        item.title ||
        item.unitName ||
        item.knowledgeObjectId ||
        "tema académico";
      return `${index + 1}. ${target}: ${item.reason} Dificultad sugerida: ${difficultyLabel(item.recommendedDifficulty)}.`;
    })
    .join("\n");
}

export async function updateRecommendationStatus(
  userId: string,
  recommendationId: string,
  status: RecommendationStatus,
) {
  const db = createSupabaseAdmin();
  const { data, error } = await db
    .from("adaptive_recommendations")
    .update({
      status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", recommendationId)
    .eq("user_id", userId)
    .select("id,knowledge_object_id,topic_id,unit_id,status")
    .single();
  if (error || !data)
    throw new Error("No se pudo actualizar la recomendación.");
  const eventType =
    status === "accepted"
      ? "recommendation_accepted"
      : status === "postponed"
        ? "recommendation_postponed"
        : status === "dismissed"
          ? "recommendation_dismissed"
          : status === "completed"
            ? "recommendation_completed"
            : "recommendation_accepted";
  await db.from("adaptive_learning_events").insert({
    user_id: userId,
    recommendation_id: recommendationId,
    knowledge_object_id: data.knowledge_object_id,
    topic_id: data.topic_id,
    unit_id: data.unit_id,
    event_type: eventType,
    metadata: { status },
  });
  return data;
}

function recommendationCandidates(gap: LearningGap): AdaptiveRecommendation[] {
  const target = {
    knowledgeObjectId: gap.knowledgeObjectId,
    topicId: gap.topicId,
    unitId: gap.unitId,
  };
  const base = {
    ...target,
    recommendedDifficulty: gap.estimate.recommendedDifficulty,
    evidenceSnapshot: {
      ...gap.estimate.evidenceSnapshot,
      masteryScore: gap.estimate.masteryScore,
      masteryLevel: gap.estimate.masteryLevel,
    },
  };
  if (gap.gapType === "RECURRENT_DIFFICULTY") {
    return [
      {
        ...base,
        recommendationType: "REVIEW_TOPIC",
        reasonCode: "RECURRENT_DIFFICULTY",
        priority: 95,
        reason:
          "Repasa primero el concepto base: la dificultad se repite y conviene reconstruir la respuesta correcta antes de practicar.",
      },
      {
        ...base,
        recommendationType: "PRACTICE_TOPIC",
        reasonCode: "RECURRENT_DIFFICULTY",
        priority: 86,
        reason:
          "Después del repaso, responde una pregunta abierta para verificar si ya puedes explicar el tema con tus palabras.",
      },
    ];
  }
  if (gap.gapType === "OBSERVED_DIFFICULTY") {
    return [
      {
        ...base,
        recommendationType: "PRACTICE_TOPIC",
        reasonCode: "OBSERVED_DIFFICULTY",
        priority: 72,
        reason:
          "Practica este tema con una pregunta corta: hay señales de dificultad, pero todavía puede corregirse con práctica dirigida.",
      },
    ];
  }
  if (gap.gapType === "ISOLATED_ERROR") {
    return [
      {
        ...base,
        recommendationType: "RETRY_ASSESSMENT",
        reasonCode: "ISOLATED_ERROR",
        priority: 46,
        reason:
          "Hubo un error aislado. Responde otra pregunta para confirmar si fue una confusión momentánea.",
      },
    ];
  }
  return [
    {
      ...base,
      recommendationType: "PRACTICE_TOPIC",
      reasonCode: "INSUFFICIENT_EVIDENCE",
      priority: 32,
      reason:
        "Falta evidencia para estimar dominio. Realiza una pregunta de práctica sobre este tema.",
    },
  ];
}

async function buildStartRecommendation(): Promise<AdaptiveRecommendation | null> {
  const db = createSupabaseAdmin();
  const { data } = await db
    .from("academic_units")
    .select("id,unit_number,unit_name")
    .eq("is_enabled", true)
    .order("unit_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    unitId: data.id,
    topicId: null,
    knowledgeObjectId: null,
    recommendationType: "START_NEW_TOPIC",
    reasonCode: "START_NEW_TOPIC",
    priority: 30,
    recommendedDifficulty: "basic",
    reason: `Comienza por la Unidad ${data.unit_number}: ${data.unit_name}. Aún no hay evidencia suficiente para personalizar un refuerzo más específico.`,
    evidenceSnapshot: {
      evidenceCount: 0,
      calculationVersion: ADAPTIVE_CALCULATION_VERSION,
    },
  };
}

async function persistMastery(userId: string, estimate: MasteryEstimate) {
  const db = createSupabaseAdmin();
  let existingQuery = db
    .from("student_mastery_estimates")
    .select("id,mastery_score");
  existingQuery = estimate.knowledgeObjectId
    ? existingQuery.eq("knowledge_object_id", estimate.knowledgeObjectId)
    : existingQuery.is("knowledge_object_id", null);
  existingQuery = estimate.topicId
    ? existingQuery.eq("topic_id", estimate.topicId)
    : existingQuery.is("topic_id", null);
  existingQuery = estimate.unitId
    ? existingQuery.eq("unit_id", estimate.unitId)
    : existingQuery.is("unit_id", null);
  const existing = await existingQuery.eq("user_id", userId).maybeSingle();
  const payload = {
    user_id: userId,
    knowledge_object_id: estimate.knowledgeObjectId,
    topic_id: estimate.topicId,
    unit_id: estimate.unitId,
    mastery_score: estimate.masteryScore,
    mastery_level: estimate.masteryLevel,
    evidence_count: estimate.evidenceCount,
    correct_answers: estimate.correctAnswers,
    partial_answers: estimate.partialAnswers,
    incorrect_answers: estimate.incorrectAnswers,
    last_assessed_at: estimate.lastAssessedAt,
    calculation_version: ADAPTIVE_CALCULATION_VERSION,
    evidence_snapshot: estimate.evidenceSnapshot,
  };
  const result = existing.data?.id
    ? await db
        .from("student_mastery_estimates")
        .update(payload)
        .eq("id", existing.data.id)
    : await db.from("student_mastery_estimates").insert(payload);
  if (!result.error) {
    await db.from("adaptive_learning_events").insert({
      user_id: userId,
      knowledge_object_id: estimate.knowledgeObjectId,
      topic_id: estimate.topicId,
      unit_id: estimate.unitId,
      event_type: "mastery_recalculated",
      previous_mastery: existing.data?.mastery_score || null,
      updated_mastery: estimate.masteryScore,
      metadata: {
        masteryLevel: estimate.masteryLevel,
        calculationVersion: ADAPTIVE_CALCULATION_VERSION,
      },
    });
  }
}

async function persistRecommendation(
  userId: string,
  recommendation: AdaptiveRecommendation,
): Promise<AdaptiveRecommendation | null> {
  const db = createSupabaseAdmin();
  let activeQuery = db
    .from("adaptive_recommendations")
    .select("id,status,created_at,updated_at");
  activeQuery = recommendation.knowledgeObjectId
    ? activeQuery.eq("knowledge_object_id", recommendation.knowledgeObjectId)
    : activeQuery.is("knowledge_object_id", null);
  activeQuery = recommendation.topicId
    ? activeQuery.eq("topic_id", recommendation.topicId)
    : activeQuery.is("topic_id", null);
  activeQuery = recommendation.unitId
    ? activeQuery.eq("unit_id", recommendation.unitId)
    : activeQuery.is("unit_id", null);
  const active = await activeQuery
    .eq("user_id", userId)
    .eq("recommendation_type", recommendation.recommendationType)
    .in("status", ["active", "accepted", "in_progress"])
    .maybeSingle();
  const payload = {
    user_id: userId,
    knowledge_object_id: recommendation.knowledgeObjectId,
    topic_id: recommendation.topicId,
    unit_id: recommendation.unitId,
    recommendation_type: recommendation.recommendationType,
    priority: recommendation.priority,
    reason_code: recommendation.reasonCode,
    recommended_difficulty: recommendation.recommendedDifficulty,
    reason: recommendation.reason,
    evidence_snapshot: recommendation.evidenceSnapshot,
    status: recommendation.status || "active",
  };
  const { data, error } = active.data?.id
    ? await db
        .from("adaptive_recommendations")
        .update(payload)
        .eq("id", active.data.id)
        .select("*")
        .single()
    : await db
        .from("adaptive_recommendations")
        .insert(payload)
        .select("*")
        .single();
  if (error || !data) return null;
  return fromRecommendationRow(data);
}

async function readActiveRecommendations(userId: string, limit: number) {
  const { data } = await createSupabaseAdmin()
    .from("adaptive_recommendations")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["active", "accepted", "in_progress"])
    .order("priority", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data || []).map(fromRecommendationRow);
}

async function enrichRecommendations(
  recommendations: AdaptiveRecommendation[],
) {
  const db = createSupabaseAdmin();
  const knowledgeIds = [
    ...new Set(
      recommendations.map((item) => item.knowledgeObjectId).filter(Boolean),
    ),
  ] as string[];
  const topicIds = [
    ...new Set(recommendations.map((item) => item.topicId).filter(Boolean)),
  ] as string[];
  const unitIds = [
    ...new Set(recommendations.map((item) => item.unitId).filter(Boolean)),
  ] as string[];
  const [knowledge, topics, units] = await Promise.all([
    knowledgeIds.length
      ? db
          .from("knowledge_objects")
          .select(
            "id,title,concept,academic_units(unit_number,unit_name),academic_topics(topic_name)",
          )
          .in("id", knowledgeIds)
      : Promise.resolve({ data: [] }),
    topicIds.length
      ? db
          .from("academic_topics")
          .select(
            "id,topic_name,topic_number,academic_units(unit_number,unit_name)",
          )
          .in("id", topicIds)
      : Promise.resolve({ data: [] }),
    unitIds.length
      ? db
          .from("academic_units")
          .select("id,unit_number,unit_name")
          .in("id", unitIds)
      : Promise.resolve({ data: [] }),
  ]);
  const byKnowledge = new Map(
    (knowledge.data || []).map((row) => [
      String(row.id),
      row as Record<string, unknown>,
    ]),
  );
  const byTopic = new Map(
    (topics.data || []).map((row) => [
      String(row.id),
      row as Record<string, unknown>,
    ]),
  );
  const byUnit = new Map(
    (units.data || []).map((row) => [
      String(row.id),
      row as Record<string, unknown>,
    ]),
  );
  return recommendations
    .map((item) => {
      const ko = item.knowledgeObjectId
        ? byKnowledge.get(item.knowledgeObjectId)
        : null;
      const topic = item.topicId ? byTopic.get(item.topicId) : null;
      const unit = item.unitId ? byUnit.get(item.unitId) : null;
      const koUnit = firstRelation(ko?.academic_units) as Record<
        string,
        unknown
      > | null;
      const koTopic = firstRelation(ko?.academic_topics) as Record<
        string,
        unknown
      > | null;
      const topicUnit = firstRelation(topic?.academic_units) as Record<
        string,
        unknown
      > | null;
      return {
        ...item,
        title: String(
          ko?.title ||
            ko?.concept ||
            topic?.topic_name ||
            unit?.unit_name ||
            "Tema recomendado",
        ),
        topicName:
          String(
            koTopic?.topic_name || topic?.topic_name || item.topicName || "",
          ).trim() || null,
        unitName:
          String(
            koUnit?.unit_name ||
              topicUnit?.unit_name ||
              unit?.unit_name ||
              item.unitName ||
              "",
          ).trim() || null,
        unitNumber: numberOrNull(
          koUnit?.unit_number || topicUnit?.unit_number || unit?.unit_number,
        ),
      };
    })
    .sort((a, b) => b.priority - a.priority);
}

function fromRecommendationRow(
  row: Record<string, unknown>,
): AdaptiveRecommendation {
  return {
    id: String(row.id),
    knowledgeObjectId: row.knowledge_object_id
      ? String(row.knowledge_object_id)
      : null,
    topicId: row.topic_id ? String(row.topic_id) : null,
    unitId: row.unit_id ? String(row.unit_id) : null,
    recommendationType:
      row.recommendation_type as AdaptiveRecommendation["recommendationType"],
    reasonCode: row.reason_code as AdaptiveRecommendation["reasonCode"],
    priority: Number(row.priority || 0),
    recommendedDifficulty:
      row.recommended_difficulty as AdaptiveRecommendation["recommendedDifficulty"],
    reason: String(row.reason || ""),
    status: row.status as AdaptiveRecommendation["status"],
    evidenceSnapshot: (row.evidence_snapshot || {}) as Record<string, unknown>,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function firstRelation(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value || null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function difficultyLabel(value: string | null | undefined) {
  if (value === "advanced") return "avanzada";
  if (value === "intermediate") return "intermedia";
  return "básica";
}

export const _adaptiveTestExports = {
  recommendationCandidates,
  adaptiveScopeKey,
};
