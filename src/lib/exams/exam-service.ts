import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createAssessmentSession } from "@/lib/assessment/question-generator";
import { gradeAssessmentAnswer } from "@/lib/assessment/grading-service";
import type { Profile } from "@/lib/models";
import {
  createExamSchema,
  distributeCounts,
  normalizeExamDifficulty,
  normalizeExamQuestionType,
  type CreateExamConfig,
  type ExamStatus,
  type PublicExamQuestion,
  type PublicExamSession,
} from "@/lib/exams/types";

const terminalStatuses = new Set(["completed", "cancelled", "grading_failed"]);

export async function createExam(profile: Profile, rawConfig: unknown) {
  const parsed = createExamSchema.safeParse(rawConfig);
  if (!parsed.success) throw new Error("Configuración de examen inválida.");
  const config = normalizeConfig(parsed.data);
  const db = createSupabaseAdmin();
  const durationSeconds = config.durationMinutes ? config.durationMinutes * 60 : null;
  const { data: exam, error } = await db
    .from("exam_sessions")
    .insert({
      user_id: profile.id,
      exam_mode: config.examMode,
      configuration: config,
      status: "draft",
      total_questions: 0,
      duration_seconds: durationSeconds,
      max_score: 0,
    })
    .select("id")
    .single();
  if (error || !exam) throw new Error("No se pudo crear el examen.");

  const chunks = distributionForConfig(config);
  const questionRows: Array<{
    exam_session_id: string;
    assessment_session_id: string;
    question_id: string;
    display_order: number;
    max_score: number;
    question_snapshot: unknown;
  }> = [];
  let displayOrder = 1;
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    const assessmentSessionId = await createAssessmentSession({
      profile,
      unitNumber: chunk.unitNumber,
      topicId: config.examMode === "topic" ? config.topicId || null : null,
      topicName: config.examMode === "topic" ? config.topicName || null : null,
      questionType: normalizeExamQuestionType(config.questionType, config.examMode),
      difficulty: normalizeExamDifficulty(config.difficulty, chunkIndex),
      count: chunk.count,
    });
    const { data: assigned, error: assignedError } = await db
      .from("assessment_session_questions")
      .select("question_id,question_order,question_snapshot")
      .eq("assessment_session_id", assessmentSessionId)
      .order("question_order");
    if (assignedError || !assigned?.length) throw new Error("No se pudieron preparar las preguntas del examen.");
    for (const row of assigned) {
      questionRows.push({
        exam_session_id: exam.id,
        assessment_session_id: assessmentSessionId,
        question_id: row.question_id,
        display_order: displayOrder,
        max_score: 1,
        question_snapshot: { ...(row.question_snapshot as object), order: displayOrder },
      });
      displayOrder += 1;
    }
  }

  const limitedRows = questionRows.slice(0, config.count);
  if (limitedRows.length < config.count) {
    throw new Error("No hay suficientes preguntas válidas para la configuración solicitada. Reduce la cantidad o cambia la unidad/tema.");
  }
  const { error: insertError } = await db.from("exam_session_questions").insert(limitedRows);
  if (insertError) throw new Error("No se pudieron asignar las preguntas al examen.");
  await db
    .from("exam_sessions")
    .update({ status: "ready", total_questions: limitedRows.length, max_score: limitedRows.length })
    .eq("id", exam.id);
  return exam.id as string;
}

export async function startExam(profile: Profile, examId: string) {
  const db = createSupabaseAdmin();
  const session = await getOwnedExamRow(profile, examId);
  if (session.status === "in_progress") return getExamSession(profile, examId, { includeFeedback: false });
  if (session.status !== "ready" && session.status !== "draft") throw new Error("Este examen no puede iniciarse.");
  const now = new Date();
  const duration = session.duration_seconds ? Number(session.duration_seconds) : null;
  const deadline = duration ? new Date(now.getTime() + duration * 1000).toISOString() : null;
  await db
    .from("exam_sessions")
    .update({ status: "in_progress", started_at: now.toISOString(), deadline_at: deadline })
    .eq("id", examId)
    .eq("user_id", profile.id);
  return getExamSession(profile, examId, { includeFeedback: false });
}

export async function saveExamAnswer(profile: Profile, input: { examId: string; sessionQuestionId: string; answer: string | boolean; inputMode?: "text" | "voice"; transcriptRaw?: string | null; transcriptEdited?: boolean }) {
  const db = createSupabaseAdmin();
  const exam = await getOwnedExamRow(profile, input.examId);
  if (await isExpired(exam)) {
    await expireExam(profile, input.examId);
    throw new Error("El tiempo del examen venció. Ya no se pueden guardar respuestas.");
  }
  if (exam.status !== "in_progress") throw new Error("El examen no está en desarrollo.");
  const { data: question, error: questionError } = await db
    .from("exam_session_questions")
    .select("id")
    .eq("id", input.sessionQuestionId)
    .eq("exam_session_id", input.examId)
    .single();
  if (questionError || !question) throw new Error("La pregunta no pertenece a este examen.");
  const { error } = await db.from("exam_session_answers").upsert(
    {
      exam_session_id: input.examId,
      session_question_id: input.sessionQuestionId,
      user_id: profile.id,
      answer: { value: input.answer, inputMode: input.inputMode || "text", transcriptRaw: input.transcriptRaw || null, transcriptEdited: Boolean(input.transcriptEdited) },
      grading_status: "pending",
      answered_at: new Date().toISOString(),
    },
    { onConflict: "exam_session_id,session_question_id,user_id" },
  );
  if (error) throw new Error("No se pudo guardar la respuesta.");
  return getExamSession(profile, input.examId, { includeFeedback: false });
}

export async function submitExam(profile: Profile, examId: string) {
  const db = createSupabaseAdmin();
  const exam = await getOwnedExamRow(profile, examId);
  if (exam.status === "completed") return getExamSession(profile, examId, { includeFeedback: true });
  if (terminalStatuses.has(exam.status)) throw new Error("Este examen ya no puede enviarse.");
  if (!["in_progress", "expired", "submitted", "grading"].includes(exam.status)) throw new Error("El examen debe iniciarse antes de finalizar.");
  const expired = await isExpired(exam);
  const now = new Date().toISOString();
  await db
    .from("exam_sessions")
    .update({ status: "grading", submitted_at: exam.submitted_at || now })
    .eq("id", examId)
    .eq("user_id", profile.id);
  try {
    const [{ data: questions }, { data: answers }] = await Promise.all([
      db
        .from("exam_session_questions")
        .select("id,assessment_session_id,question_id")
        .eq("exam_session_id", examId)
        .order("display_order"),
      db
        .from("exam_session_answers")
        .select("id,session_question_id,answer,grading_status")
        .eq("exam_session_id", examId)
        .eq("user_id", profile.id),
    ]);
    const answerByQuestion = new Map((answers || []).map((row) => [row.session_question_id, row]));
    for (const question of questions || []) {
      const answer = answerByQuestion.get(question.id);
      if (!answer || answer.grading_status === "graded") continue;
      const value = (answer.answer as { value?: string | boolean })?.value;
      if (value === undefined || value === null || value === "") continue;
      const graded = await gradeAssessmentAnswer({
        profile,
        sessionId: question.assessment_session_id,
        questionId: question.question_id,
        answer: value,
      });
      const feedback = graded.feedback;
      await db
        .from("exam_session_answers")
        .update({
          is_correct: feedback.result === "correct",
          score: feedback.score,
          feedback,
          grading_method: feedback.gradingMethod,
          grading_status: feedback.result === "requires_review" ? "requires_review" : "graded",
        })
        .eq("id", answer.id);
    }
    await recomputeExamResult(profile.id, examId, expired);
    return getExamSession(profile, examId, { includeFeedback: true });
  } catch (error) {
    await db.from("exam_sessions").update({ status: "grading_failed" }).eq("id", examId).eq("user_id", profile.id);
    throw error;
  }
}

export async function getExamSession(profile: Profile, examId: string, options: { includeFeedback: boolean }) {
  const db = createSupabaseAdmin();
  const exam = await getOwnedExamRow(profile, examId);
  const [{ data: questions }, { data: answers }, { data: result }] = await Promise.all([
    db
      .from("exam_session_questions")
      .select("id,question_id,display_order,question_snapshot")
      .eq("exam_session_id", examId)
      .order("display_order"),
    db
      .from("exam_session_answers")
      .select("session_question_id,answer,score,feedback,grading_status,is_correct")
      .eq("exam_session_id", examId)
      .eq("user_id", profile.id),
    db.from("exam_results").select("percentage,result_summary").eq("exam_session_id", examId).maybeSingle(),
  ]);
  const answerByQuestion = new Map((answers || []).map((row) => [row.session_question_id, row]));
  const publicQuestions = (questions || []).map((row) => {
    const snapshot = row.question_snapshot as Record<string, unknown>;
    const answer = answerByQuestion.get(row.id);
    return {
      id: row.id,
      questionId: row.question_id,
      order: Number(row.display_order),
      questionType: String(snapshot.questionType),
      questionText: String(snapshot.questionText),
      options: Array.isArray(snapshot.options) ? snapshot.options : [],
      difficulty: String(snapshot.difficulty),
      sourceReferences: Array.isArray(snapshot.sourceReferences) ? snapshot.sourceReferences.map(String) : [],
      answer: (answer?.answer as { value?: string | boolean } | undefined)?.value ?? null,
      answered: Boolean(answer),
      feedback: options.includeFeedback ? answer?.feedback : undefined,
      score: options.includeFeedback ? Number(answer?.score || 0) : undefined,
      gradingStatus: options.includeFeedback ? answer?.grading_status : undefined,
    } as PublicExamQuestion;
  });
  const answered = publicQuestions.filter((question) => question.answered).length;
  const percentage = result?.percentage !== undefined ? Number(result.percentage) : Number(exam.max_score) ? Math.round((Number(exam.total_score || 0) / Number(exam.max_score || 1)) * 100) : 0;
  const summary = (result?.result_summary || {}) as { recommendations?: string[] };
  return {
    id: exam.id,
    examMode: exam.exam_mode,
    status: exam.status,
    configuration: exam.configuration,
    totalQuestions: Number(exam.total_questions || publicQuestions.length),
    answeredQuestions: answered,
    durationSeconds: exam.duration_seconds === null ? null : Number(exam.duration_seconds),
    startedAt: exam.started_at,
    deadlineAt: exam.deadline_at,
    submittedAt: exam.submitted_at,
    completedAt: exam.completed_at,
    totalScore: Number(exam.total_score || 0),
    maxScore: Number(exam.max_score || publicQuestions.length),
    percentage,
    questions: publicQuestions,
    recommendations: summary.recommendations || [],
  } as PublicExamSession;
}

export async function getExamHistory(profile: Profile, limit = 40) {
  const { data, error } = await createSupabaseAdmin()
    .from("exam_sessions")
    .select("id,exam_mode,status,configuration,total_questions,total_score,max_score,started_at,completed_at,created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("No se pudo consultar el historial de simulacros.");
  return (data || []).map((row) => ({
    id: row.id,
    examMode: row.exam_mode,
    status: row.status,
    configuration: row.configuration,
    totalQuestions: Number(row.total_questions || 0),
    totalScore: Number(row.total_score || 0),
    maxScore: Number(row.max_score || 0),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  }));
}

async function recomputeExamResult(userId: string, examId: string, expired: boolean) {
  const db = createSupabaseAdmin();
  const [{ data: answers }, { data: exam }] = await Promise.all([
    db.from("exam_session_answers").select("score,grading_status,feedback").eq("exam_session_id", examId).eq("user_id", userId),
    db.from("exam_sessions").select("total_questions,max_score").eq("id", examId).single(),
  ]);
  const rows = answers || [];
  const totalScore = rows.reduce((sum, row) => sum + Number(row.score || 0), 0);
  const maxScore = Number(exam?.max_score || exam?.total_questions || 0);
  const percentage = maxScore ? Number(((totalScore / maxScore) * 100).toFixed(2)) : 0;
  const incorrect = rows.filter((row) => row.grading_status === "graded" && Number(row.score || 0) === 0).length;
  const partial = rows.filter((row) => Number(row.score || 0) > 0 && Number(row.score || 0) < 1).length;
  const review = rows.filter((row) => row.grading_status === "requires_review").length;
  const recommendations = buildRecommendations(rows.map((row) => row.feedback));
  const summary = { incorrect, partial, review, expired, recommendations, provisional: review > 0 };
  await db.from("exam_results").upsert(
    { exam_session_id: examId, user_id: userId, total_score: totalScore, max_score: maxScore, percentage, result_summary: summary, completed_at: new Date().toISOString() },
    { onConflict: "exam_session_id" },
  );
  await db.from("exam_sessions").update({ status: expired ? "expired" : "completed", total_score: totalScore, max_score: maxScore, completed_at: new Date().toISOString() }).eq("id", examId);
}

function buildRecommendations(feedbackRows: unknown[]) {
  const topics = new Map<string, number>();
  for (const feedback of feedbackRows) {
    const row = feedback as { reinforce?: string[]; missingConcepts?: string[] } | null;
    for (const item of [...(row?.reinforce || []), ...(row?.missingConcepts || [])]) {
      const text = String(item).trim();
      if (text) topics.set(text, (topics.get(text) || 0) + 1);
    }
  }
  return [...topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([topic]) => topic);
}

async function getOwnedExamRow(profile: Profile, examId: string) {
  const { data, error } = await createSupabaseAdmin()
    .from("exam_sessions")
    .select("*")
    .eq("id", examId)
    .eq("user_id", profile.id)
    .single();
  if (error || !data) throw new Error("No se encontró el examen.");
  return data as {
    id: string;
    user_id: string;
    exam_mode: "topic" | "unit" | "integral" | "tribunal";
    configuration: CreateExamConfig & Record<string, unknown>;
    status: ExamStatus;
    total_questions: number;
    duration_seconds: number | null;
    started_at: string | null;
    deadline_at: string | null;
    submitted_at: string | null;
    completed_at: string | null;
    total_score: number;
    max_score: number;
  };
}

async function isExpired(exam: { deadline_at: string | null; status: string }) {
  return Boolean(exam.deadline_at && Date.now() > Date.parse(exam.deadline_at) && exam.status === "in_progress");
}

async function expireExam(profile: Profile, examId: string) {
  await createSupabaseAdmin().from("exam_sessions").update({ status: "expired", submitted_at: new Date().toISOString() }).eq("id", examId).eq("user_id", profile.id);
}

function normalizeConfig(config: CreateExamConfig): CreateExamConfig {
  const unitNumbers = [...new Set(config.unitNumbers)].sort((a, b) => a - b);
  return {
    ...config,
    unitNumbers: config.examMode === "integral" ? unitNumbers : [unitNumbers[0] || 1],
    questionType: config.examMode === "tribunal" ? "open_answer" : config.questionType,
    difficulty: config.difficulty === "mixed" ? "mixed" : config.difficulty,
  };
}

function distributionForConfig(config: CreateExamConfig) {
  return distributeCounts(config.count, config.examMode === "integral" ? config.unitNumbers : [config.unitNumbers[0] || 1]);
}

