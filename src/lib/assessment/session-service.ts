import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/models";
import type { AssessmentSessionPublic, GradingFeedback, PublicAssessmentQuestion } from "@/lib/assessment/types";

export async function getAssessmentSession(profile: Profile, sessionId: string): Promise<AssessmentSessionPublic> {
  const db = createSupabaseAdmin();
  const { data: session, error } = await db
    .from("assessment_sessions")
    .select("id,status,question_type,difficulty,total_questions,answered_questions,correct_answers,partial_answers,incorrect_answers,total_score,max_score,started_at,completed_at,metadata,user_id")
    .eq("id", sessionId)
    .eq("user_id", profile.id)
    .single();
  if (error || !session) throw new Error("No se encontró la evaluación.");

  const [{ data: assigned }, { data: answers }] = await Promise.all([
    db
      .from("assessment_session_questions")
      .select("question_order,question_snapshot,question_id")
      .eq("assessment_session_id", sessionId)
      .order("question_order"),
    db
      .from("assessment_answers")
      .select("question_id,feedback")
      .eq("assessment_session_id", sessionId)
      .eq("user_id", profile.id),
  ]);
  const feedbackByQuestion = new Map((answers || []).map((row) => [row.question_id, row.feedback as GradingFeedback]));
  const questions = (assigned || []).map((row) => {
    const snapshot = row.question_snapshot as Record<string, unknown>;
    const feedback = feedbackByQuestion.get(row.question_id);
    return {
      id: String(row.question_id),
      order: Number(row.question_order),
      questionType: String(snapshot.questionType),
      questionText: String(snapshot.questionText),
      options: Array.isArray(snapshot.options) ? snapshot.options : [],
      difficulty: String(snapshot.difficulty),
      sourceReferences: Array.isArray(snapshot.sourceReferences) ? snapshot.sourceReferences.map(String) : [],
      answered: Boolean(feedback),
      feedback,
    } as PublicAssessmentQuestion;
  });
  const metadata = session.metadata as Record<string, unknown> | null;
  return {
    id: session.id,
    status: session.status,
    unitName: metadata?.unitName ? String(metadata.unitName) : null,
    topicName: metadata?.topicName ? String(metadata.topicName) : null,
    questionType: session.question_type,
    difficulty: session.difficulty,
    totalQuestions: Number(session.total_questions || questions.length),
    answeredQuestions: Number(session.answered_questions || 0),
    correctAnswers: Number(session.correct_answers || 0),
    partialAnswers: Number(session.partial_answers || 0),
    incorrectAnswers: Number(session.incorrect_answers || 0),
    totalScore: Number(session.total_score || 0),
    maxScore: Number(session.max_score || questions.length),
    startedAt: session.started_at,
    completedAt: session.completed_at,
    questions,
  };
}

export async function getAssessmentHistory(profile: Profile, limit = 30) {
  const { data, error } = await createSupabaseAdmin()
    .from("assessment_sessions")
    .select("id,status,question_type,difficulty,total_questions,answered_questions,correct_answers,partial_answers,incorrect_answers,total_score,max_score,started_at,completed_at,metadata")
    .eq("user_id", profile.id)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("No se pudo consultar el historial de evaluaciones.");
  return (data || []).map((row) => {
    const metadata = row.metadata as Record<string, unknown> | null;
    return {
      id: row.id,
      status: row.status,
      unitName: metadata?.unitName ? String(metadata.unitName) : "Unidad",
      topicName: metadata?.topicName ? String(metadata.topicName) : null,
      questionType: row.question_type,
      difficulty: row.difficulty,
      totalQuestions: Number(row.total_questions || 0),
      answeredQuestions: Number(row.answered_questions || 0),
      correctAnswers: Number(row.correct_answers || 0),
      partialAnswers: Number(row.partial_answers || 0),
      incorrectAnswers: Number(row.incorrect_answers || 0),
      totalScore: Number(row.total_score || 0),
      maxScore: Number(row.max_score || 0),
      startedAt: row.started_at,
      completedAt: row.completed_at,
    };
  });
}

export async function getAssessmentCatalog() {
  const db = createSupabaseAdmin();
  const [{ data: units }, { data: topics }] = await Promise.all([
    db.from("academic_units").select("id,unit_number,unit_name").order("unit_number"),
    db.from("academic_topics").select("id,academic_unit_id,topic_number,topic_name").order("topic_number"),
  ]);
  return {
    units: (units || []).map((unit) => ({ id: unit.id, number: unit.unit_number, name: unit.unit_name })),
    topics: (topics || []).map((topic) => ({ id: topic.id, unitId: topic.academic_unit_id, number: topic.topic_number, name: topic.topic_name })),
  };
}
