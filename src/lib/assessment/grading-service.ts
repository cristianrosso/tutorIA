import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { estimateTextCost } from "@/lib/ai/costs";
import { generateTutorText } from "@/lib/ai/openai";
import { recordAIUsage } from "@/lib/billing/ai-usage";
import { ensureStudentAcademicProfile, recordLearningEvent } from "@/lib/learning/academic-memory";
import type { Profile } from "@/lib/models";
import { normalizeForCompare, type AssessmentResult, type GradingFeedback, type RubricCriterion } from "@/lib/assessment/types";

export type QuestionRow = {
  id: string;
  knowledge_object_id: string | null;
  unit_id: string | null;
  topic_id: string | null;
  question_type: string;
  question_text: string;
  options: Array<{ id: string; text: string }> | null;
  correct_answer: string | boolean | string[] | null;
  expected_answer: string | null;
  rubric: RubricCriterion[] | null;
  explanation: string;
  source_references: string[] | null;
};

type AnswerInput = {
  profile: Profile;
  sessionId: string;
  questionId: string;
  answer: string | boolean;
};

export async function gradeAssessmentAnswer(input: AnswerInput) {
  const db = createSupabaseAdmin();
  const { data: session, error: sessionError } = await db
    .from("assessment_sessions")
    .select("id,user_id,status")
    .eq("id", input.sessionId)
    .eq("user_id", input.profile.id)
    .single();
  if (sessionError || !session) throw new Error("No se encontró la evaluación.");
  if (session.status === "completed") throw new Error("La evaluación ya fue finalizada.");

  const { data: existing } = await db
    .from("assessment_answers")
    .select("id,feedback,result,score,max_score,grading_method,grading_confidence")
    .eq("assessment_session_id", input.sessionId)
    .eq("question_id", input.questionId)
    .eq("user_id", input.profile.id)
    .maybeSingle();
  if (existing) return { alreadyAnswered: true, feedback: existing.feedback as GradingFeedback };

  const { data: assigned, error: assignedError } = await db
    .from("assessment_session_questions")
    .select("question_id")
    .eq("assessment_session_id", input.sessionId)
    .eq("question_id", input.questionId)
    .single();
  if (assignedError || !assigned) throw new Error("La pregunta no pertenece a esta evaluación.");

  const { data: question, error: questionError } = await db
    .from("assessment_questions")
    .select("id,knowledge_object_id,unit_id,topic_id,question_type,question_text,options,correct_answer,expected_answer,rubric,explanation,source_references")
    .eq("id", input.questionId)
    .single();
  if (questionError || !question) throw new Error("No se encontró la pregunta.");

  const feedback = await gradeQuestion(input.profile, question as QuestionRow, input.answer, input.sessionId);
  const { error: answerError } = await db.from("assessment_answers").insert({
    assessment_session_id: input.sessionId,
    question_id: input.questionId,
    user_id: input.profile.id,
    student_answer: { value: input.answer },
    result: feedback.result,
    is_correct: feedback.result === "correct",
    score: feedback.score,
    max_score: feedback.maxScore,
    feedback,
    grading_method: feedback.gradingMethod,
    grading_confidence: feedback.gradingConfidence,
  });
  if (answerError) throw new Error("No se pudo guardar la respuesta.");

  await registerLearningEvidence(input.profile.id, input.sessionId, question as QuestionRow, feedback);
  await recomputeSession(input.sessionId);
  return { alreadyAnswered: false, feedback };
}

async function gradeQuestion(profile: Profile, question: QuestionRow, answer: string | boolean, sessionId: string): Promise<GradingFeedback> {
  if (question.question_type === "multiple_choice") return gradeMultipleChoice(question, String(answer));
  if (question.question_type === "true_false") return gradeTrueFalse(question, answer);
  if (question.question_type === "short_answer") return gradeShortAnswer(question, String(answer));
  return gradeOpenWithRubric(profile, question, String(answer), sessionId);
}

export function gradeMultipleChoice(question: QuestionRow, answer: string): GradingFeedback {
  const selected = String(answer).trim().toUpperCase();
  const correct = String(question.correct_answer || "").trim().toUpperCase();
  const correctOption = (question.options || []).find((option) => option.id.toUpperCase() === correct);
  const isCorrect = selected === correct;
  return baseFeedback(question, {
    result: isCorrect ? "correct" : "incorrect",
    score: isCorrect ? 1 : 0,
    method: "deterministic",
    confidence: 1,
    correctAnswer: correctOption ? `${correctOption.id}. ${correctOption.text}` : correct,
    correction: isCorrect ? "Seleccionaste la alternativa correcta." : "La alternativa seleccionada no coincide con el contenido recuperado del compendio.",
    good: isCorrect ? ["Identificaste la alternativa respaldada por la fuente académica."] : [],
    missing: isCorrect ? [] : ["Revisar el concepto evaluado antes de continuar."],
  });
}

export function gradeTrueFalse(question: QuestionRow, answer: string | boolean): GradingFeedback {
  const expected = Boolean(question.correct_answer);
  const selected = typeof answer === "boolean" ? answer : /true|verdadero|si|sí/i.test(String(answer));
  const isCorrect = selected === expected;
  return baseFeedback(question, {
    result: isCorrect ? "correct" : "incorrect",
    score: isCorrect ? 1 : 0,
    method: "deterministic",
    confidence: 1,
    correctAnswer: expected ? "Verdadero" : "Falso",
    correction: isCorrect ? "La afirmación fue valorada correctamente." : "La valoración no coincide con la explicación académica de la fuente.",
    good: isCorrect ? ["Reconociste el valor correcto de la afirmación."] : [],
    missing: isCorrect ? [] : ["Contrastar la afirmación con la explicación del compendio."],
  });
}

export function gradeShortAnswer(question: QuestionRow, answer: string): GradingFeedback {
  const expected = extractExpectedConcepts(question);
  const normalizedAnswer = normalizeForCompare(answer);
  const matched = expected.filter((concept) => normalizedAnswer.includes(normalizeForCompare(concept)));
  const ratio = expected.length ? matched.length / expected.length : normalizedAnswer.length > 20 ? 0.6 : 0;
  const result: AssessmentResult = ratio >= 0.75 ? "correct" : ratio >= 0.35 ? "partially_correct" : "incorrect";
  return baseFeedback(question, {
    result,
    score: result === "correct" ? 1 : result === "partially_correct" ? 0.5 : 0,
    method: "semantic_rules",
    confidence: expected.length ? Math.min(0.95, 0.55 + ratio * 0.4) : 0.45,
    correctAnswer: question.expected_answer || undefined,
    correction: result === "correct" ? "Tu formulación recoge los conceptos esenciales esperados." : result === "partially_correct" ? "Tu respuesta contiene una parte del concepto, pero faltan elementos académicos importantes." : "La respuesta no incorpora los conceptos esenciales esperados según la fuente recuperada.",
    good: matched,
    missing: expected.filter((concept) => !matched.includes(concept)),
  });
}

async function gradeOpenWithRubric(profile: Profile, question: QuestionRow, answer: string, sessionId: string): Promise<GradingFeedback> {
  const rubric = (question.rubric || []).slice(0, 5);
  if (!rubric.length) return gradeShortAnswer(question, answer);
  const model = process.env.OPENAI_ASSESSMENT_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-terra";
  const completion = await generateTutorText({
    model,
    maxOutputTokens: 900,
    system: "Eres evaluador formativo de FATESCIPOL. Corrige con rúbrica y fuente. No inventes contenido. Si no hay evidencia suficiente marca requires_review.",
    user: `Pregunta:\n${question.question_text}\n\nRespuesta esperada/fuente:\n${question.expected_answer || question.explanation}\n\nRúbrica:\n${rubric.map((r) => `- ${r.criterion}: ${r.expected || ""} peso ${r.weight}`).join("\n")}\n\nRespuesta del estudiante:\n${answer}\n\nDevuelve JSON estricto: {"result":"correct|partially_correct|incorrect|requires_review","score":0-1,"confidence":0-1,"whatWasGood":[...],"missingConcepts":[...],"correction":"..."}`,
  });
  await recordAIUsage({
    userId: profile.id,
    operationId: `assessment-grade:${sessionId}:${question.id}`,
    operationType: "evaluation",
    model: completion.model,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    estimatedCostUsd: estimateTextCost(completion.inputTokens, completion.outputTokens),
    costIsEstimated: false,
  });
  const parsed = parseGradeJson(completion.text);
  return baseFeedback(question, {
    result: parsed.result,
    score: Math.max(0, Math.min(1, parsed.score)),
    method: "ai_rubric",
    confidence: Math.max(0, Math.min(1, parsed.confidence)),
    correctAnswer: question.expected_answer || undefined,
    correction: parsed.correction,
    good: parsed.whatWasGood,
    missing: parsed.missingConcepts,
  });
}

function baseFeedback(question: QuestionRow, input: {
  result: AssessmentResult;
  score: number;
  method: GradingFeedback["gradingMethod"];
  confidence: number;
  correctAnswer?: string;
  correction: string;
  good: string[];
  missing: string[];
}): GradingFeedback {
  return {
    result: input.result,
    score: Number(input.score.toFixed(2)),
    maxScore: 1,
    gradingMethod: input.method,
    gradingConfidence: Number(input.confidence.toFixed(2)),
    correctAnswer: input.correctAnswer,
    explanation: question.explanation,
    whatWasGood: input.good.filter(Boolean),
    missingConcepts: input.missing.filter(Boolean),
    correction: input.correction,
    reinforce: input.result === "correct" ? [] : extractExpectedConcepts(question).slice(0, 3),
    sourceReferences: question.source_references || [],
  };
}

function extractExpectedConcepts(question: QuestionRow) {
  const fromRubric = (question.rubric || []).flatMap((item) => [item.expected, item.criterion]).filter(Boolean).map(String);
  const fromExpected = String(question.expected_answer || "").split(/;|,|\n/).map((item) => item.trim()).filter((item) => item.length > 3);
  return [...new Set([...fromRubric, ...fromExpected])].slice(0, 8);
}

async function registerLearningEvidence(userId: string, sessionId: string, question: QuestionRow, feedback: GradingFeedback) {
  const db = createSupabaseAdmin();
  await ensureStudentAcademicProfile(userId);
  const evidenceResult = feedback.result === "correct" ? "correct" : feedback.result === "partially_correct" ? "partial" : feedback.result === "incorrect" ? "incorrect" : "unknown";
  await db.from("student_learning_evidence").insert({
    user_id: userId,
    knowledge_object_id: question.knowledge_object_id,
    question_id: question.id,
    evidence_type: "formative_check",
    result: evidenceResult,
    score: feedback.score,
    max_score: feedback.maxScore,
    feedback: feedback.correction,
  });
  await recordLearningEvent({
    userId,
    operationId: `assessment-answer:${sessionId}:${question.id}`,
    eventType: "practice_question_answered",
    source: {
      knowledgeObjectId: question.knowledge_object_id,
      unitId: question.unit_id,
      topicId: question.topic_id,
      unitNumber: null,
      unitName: null,
      topicName: null,
      sectionName: null,
      finalScore: 1,
    },
    metadata: { result: feedback.result, score: feedback.score, assessmentSessionId: sessionId },
  });
  await updateTopicProgressFromAssessment(userId, question, feedback);
}

async function updateTopicProgressFromAssessment(userId: string, question: QuestionRow, feedback: GradingFeedback) {
  if (!question.knowledge_object_id) return;
  const db = createSupabaseAdmin();
  const { data: existing } = await db
    .from("student_topic_progress")
    .select("id,practice_attempts,correct_answers,incorrect_answers,study_sessions_count")
    .eq("user_id", userId)
    .eq("knowledge_object_id", question.knowledge_object_id)
    .maybeSingle();
  const now = new Date().toISOString();
  const correctInc = feedback.result === "correct" ? 1 : 0;
  const incorrectInc = feedback.result === "incorrect" ? 1 : 0;
  const practiceAttempts = Number(existing?.practice_attempts || 0) + 1;
  const correctAnswers = Number(existing?.correct_answers || 0) + correctInc;
  const incorrectAnswers = Number(existing?.incorrect_answers || 0) + incorrectInc;
  const mastery = practiceAttempts >= 3 ? Math.round((correctAnswers / practiceAttempts) * 100) : null;
  const status = incorrectAnswers >= 2 && correctAnswers < incorrectAnswers ? "review_needed" : mastery !== null && mastery >= 75 ? "completed" : "in_progress";
  const payload = {
    user_id: userId,
    knowledge_object_id: question.knowledge_object_id,
    unit_id: question.unit_id,
    topic_id: question.topic_id,
    status,
    last_studied_at: now,
    practice_attempts: practiceAttempts,
    correct_answers: correctAnswers,
    incorrect_answers: incorrectAnswers,
    mastery_level: mastery,
    study_sessions_count: Number(existing?.study_sessions_count || 0) + (existing ? 0 : 1),
  };
  if (existing?.id) await db.from("student_topic_progress").update(payload).eq("id", existing.id);
  else await db.from("student_topic_progress").insert({ ...payload, first_studied_at: now });
  await db.from("student_academic_profiles").update({ current_unit_id: question.unit_id, current_topic_id: question.topic_id, last_studied_at: now }).eq("user_id", userId);
}

async function recomputeSession(sessionId: string) {
  const db = createSupabaseAdmin();
  const { data: answers } = await db
    .from("assessment_answers")
    .select("result,score,max_score")
    .eq("assessment_session_id", sessionId);
  const { data: session } = await db
    .from("assessment_sessions")
    .select("total_questions")
    .eq("id", sessionId)
    .single();
  const rows = answers || [];
  const answered = rows.length;
  const total = Number(session?.total_questions || answered);
  const totalScore = rows.reduce((sum, row) => sum + Number(row.score || 0), 0);
  const maxScore = rows.reduce((sum, row) => sum + Number(row.max_score || 0), 0) || total;
  await db.from("assessment_sessions").update({
    status: answered >= total ? "completed" : "in_progress",
    answered_questions: answered,
    correct_answers: rows.filter((row) => row.result === "correct").length,
    partial_answers: rows.filter((row) => row.result === "partially_correct").length,
    incorrect_answers: rows.filter((row) => row.result === "incorrect").length,
    total_score: Number(totalScore.toFixed(2)),
    max_score: Number(maxScore.toFixed(2)),
    completed_at: answered >= total ? new Date().toISOString() : null,
  }).eq("id", sessionId);
}

function parseGradeJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const fallback = { result: "requires_review" as AssessmentResult, score: 0, confidence: 0.2, whatWasGood: [], missingConcepts: [], correction: "La respuesta requiere revisión docente porque no se pudo evaluar con suficiente confianza." };
  if (start < 0 || end < start) return fallback;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<typeof fallback>;
    const result = ["correct", "partially_correct", "incorrect", "requires_review"].includes(String(parsed.result)) ? parsed.result as AssessmentResult : "requires_review";
    return {
      result,
      score: Number(parsed.score || 0),
      confidence: Number(parsed.confidence || 0.2),
      whatWasGood: Array.isArray(parsed.whatWasGood) ? parsed.whatWasGood.map(String) : [],
      missingConcepts: Array.isArray(parsed.missingConcepts) ? parsed.missingConcepts.map(String) : [],
      correction: String(parsed.correction || fallback.correction),
    };
  } catch {
    return fallback;
  }
}
