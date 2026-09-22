import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { Difficulty, NormalizedEvidence } from "@/lib/adaptive/types";

export async function collectStudentEvidence(
  userId: string,
  limit = 300,
): Promise<NormalizedEvidence[]> {
  const db = createSupabaseAdmin();
  const [memoryEvidence, assessmentAnswers, examAnswers] = await Promise.all([
    db
      .from("student_learning_evidence")
      .select(
        "id,user_id,knowledge_object_id,question_id,result,score,max_score,feedback,created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    db
      .from("assessment_answers")
      .select(
        "id,user_id,result,score,max_score,feedback,answered_at,assessment_questions(id,knowledge_object_id,unit_id,topic_id,difficulty)",
      )
      .eq("user_id", userId)
      .order("answered_at", { ascending: false })
      .limit(limit),
    db
      .from("exam_session_answers")
      .select(
        "id,user_id,score,max_score,feedback,answered_at,exam_session_questions(question_snapshot,assessment_question_id,assessment_questions(id,knowledge_object_id,unit_id,topic_id,difficulty))",
      )
      .eq("user_id", userId)
      .order("answered_at", { ascending: false })
      .limit(limit),
  ]);

  const fromMemory = (memoryEvidence.data || []).map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    knowledgeObjectId: row.knowledge_object_id
      ? String(row.knowledge_object_id)
      : null,
    topicId: null,
    unitId: null,
    result: normalizeResult(row.result),
    score: numberOrNull(row.score),
    maxScore: numberOrNull(row.max_score),
    difficulty: null,
    source: "learning_evidence" as const,
    feedback: row.feedback ? String(row.feedback) : null,
    createdAt: String(row.created_at),
  }));

  const fromAssessments = (assessmentAnswers.data || []).map((row) => {
    const question = firstRelation(
      row.assessment_questions,
    ) as QuestionRelation | null;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      knowledgeObjectId: question?.knowledge_object_id
        ? String(question.knowledge_object_id)
        : null,
      topicId: question?.topic_id ? String(question.topic_id) : null,
      unitId: question?.unit_id ? String(question.unit_id) : null,
      result: normalizeResult(row.result),
      score: numberOrNull(row.score),
      maxScore: numberOrNull(row.max_score),
      difficulty: normalizeDifficulty(question?.difficulty),
      source: "assessment_answer" as const,
      feedback: feedbackText(row.feedback),
      createdAt: String(row.answered_at),
    };
  });

  const fromExams = (examAnswers.data || []).map((row) => {
    const sessionQuestion = firstRelation(
      row.exam_session_questions,
    ) as ExamQuestionRelation | null;
    const question = firstRelation(
      sessionQuestion?.assessment_questions,
    ) as QuestionRelation | null;
    const snapshot = parseSnapshot(sessionQuestion?.question_snapshot);
    return {
      id: String(row.id),
      userId: String(row.user_id),
      knowledgeObjectId:
        question?.knowledge_object_id || snapshot.knowledge_object_id || null,
      topicId: question?.topic_id || snapshot.topic_id || null,
      unitId: question?.unit_id || snapshot.unit_id || null,
      result: resultFromScore(
        numberOrNull(row.score),
        numberOrNull(row.max_score),
        row.feedback,
      ),
      score: numberOrNull(row.score),
      maxScore: numberOrNull(row.max_score),
      difficulty: normalizeDifficulty(
        question?.difficulty || snapshot.difficulty,
      ),
      source: "exam_answer" as const,
      feedback: feedbackText(row.feedback),
      createdAt: String(row.answered_at),
    };
  });

  return [...fromMemory, ...fromAssessments, ...fromExams]
    .filter((item) => item.knowledgeObjectId || item.topicId || item.unitId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function groupEvidenceByScope(evidence: NormalizedEvidence[]) {
  const groups = new Map<string, NormalizedEvidence[]>();
  for (const item of evidence) {
    const key = item.knowledgeObjectId
      ? `ko:${item.knowledgeObjectId}`
      : item.topicId
        ? `topic:${item.topicId}`
        : `unit:${item.unitId}`;
    const current = groups.get(key) || [];
    current.push(item);
    groups.set(key, current);
  }
  return [...groups.values()];
}

type QuestionRelation = {
  knowledge_object_id?: string | null;
  unit_id?: string | null;
  topic_id?: string | null;
  difficulty?: string | null;
};
type ExamQuestionRelation = {
  question_snapshot?: unknown;
  assessment_questions?: unknown;
};

function firstRelation(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value || null;
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeResult(value: unknown): NormalizedEvidence["result"] {
  const text = String(value || "").toLowerCase();
  if (text === "correct") return "correct";
  if (text === "partial" || text === "partially_correct") return "partial";
  if (text === "incorrect") return "incorrect";
  return "unknown";
}

function resultFromScore(
  score: number | null,
  maxScore: number | null,
  feedback: unknown,
): NormalizedEvidence["result"] {
  const fromFeedback = normalizeResult(
    (feedback as { result?: unknown } | null)?.result,
  );
  if (fromFeedback !== "unknown") return fromFeedback;
  if (!maxScore || score === null) return "unknown";
  const ratio = score / maxScore;
  if (ratio >= 0.8) return "correct";
  if (ratio >= 0.35) return "partial";
  return "incorrect";
}

function normalizeDifficulty(value: unknown): Difficulty | null {
  if (value === "basic" || value === "intermediate" || value === "advanced")
    return value;
  return null;
}

function feedbackText(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value;
  const feedback = value as { correction?: unknown; summary?: unknown };
  return String(feedback.correction || feedback.summary || "").trim() || null;
}

function parseSnapshot(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== "object") return {};
  const object = value as Record<string, unknown>;
  return {
    knowledge_object_id: object.knowledge_object_id
      ? String(object.knowledge_object_id)
      : null,
    topic_id: object.topic_id ? String(object.topic_id) : null,
    unit_id: object.unit_id ? String(object.unit_id) : null,
    difficulty: object.difficulty ? String(object.difficulty) : null,
  };
}
