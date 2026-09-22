import "server-only";
import crypto from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { estimateTextCost } from "@/lib/ai/costs";
import { generateTutorText } from "@/lib/ai/openai";
import { recordAIUsage } from "@/lib/billing/ai-usage";
import { retrieveAcademicContext } from "@/lib/knowledge/rag";
import type { Profile } from "@/lib/models";
import {
  assessmentQuestionTypes,
  generatedQuestionListSchema,
  type AssessmentDifficulty,
  type AssessmentQuestionType,
  type GeneratedAssessmentQuestion,
} from "@/lib/assessment/types";

export type CreateAssessmentInput = {
  profile: Profile;
  unitNumber: number;
  topicId?: string | null;
  topicName?: string | null;
  questionType: AssessmentQuestionType | "mixed";
  difficulty: AssessmentDifficulty;
  count: number;
};

export async function createAssessmentSession(input: CreateAssessmentInput) {
  const db = createSupabaseAdmin();
  const unit = await getAcademicUnit(input.unitNumber);
  const topic = input.topicId ? await getAcademicTopic(input.topicId, unit.id) : null;
  const topicName = topic?.topic_name || input.topicName || null;
  const questionTypes = input.questionType === "mixed" ? [...assessmentQuestionTypes] : [input.questionType];
  const academic = await retrieveAcademicContext(
    buildAssessmentQuery(unit.unit_number, unit.unit_name, topicName, input.difficulty),
    { unitNumber: unit.unit_number, topicId: topic?.id, maxChunks: 10, maxContextTokens: 3200 },
  );
  if (!academic.context.trim() || academic.sources.length === 0) {
    throw new Error("No existe contenido suficiente del compendio para generar esta evaluación.");
  }

  const generated = await generateQuestions({
    profile: input.profile,
    unit,
    topic,
    topicName,
    questionTypes,
    difficulty: input.difficulty,
    count: input.count,
    context: academic.context,
    sourceReferences: academic.sources.map((source) =>
      [source.unitName, source.topicName || source.sectionName, source.sourceReference || source.pageReference]
        .filter(Boolean)
        .join(" · "),
    ),
  });

  const validQuestions = generated
    .filter((question) => validateGeneratedQuestion(question, questionTypes, input.difficulty))
    .slice(0, input.count);
  if (!validQuestions.length) {
    throw new Error("No se pudieron generar preguntas académicamente válidas para este tema.");
  }

  const { data: session, error: sessionError } = await db
    .from("assessment_sessions")
    .insert({
      user_id: input.profile.id,
      unit_id: unit.id,
      topic_id: topic?.id || null,
      assessment_type: "formative",
      status: "in_progress",
      question_type: input.questionType,
      difficulty: input.difficulty,
      total_questions: validQuestions.length,
      max_score: validQuestions.length,
      metadata: { unitNumber: unit.unit_number, unitName: unit.unit_name, topicName },
    })
    .select("id")
    .single();
  if (sessionError || !session) throw new Error("No se pudo iniciar la evaluación.");

  const rows = validQuestions.map((question) => ({
    knowledge_object_id: academic.sources[0]?.knowledgeObjectId || null,
    unit_id: unit.id,
    topic_id: topic?.id || academic.sources[0]?.topicId || null,
    question_type: question.questionType,
    question_text: question.questionText,
    options: question.options,
    correct_answer: question.correctAnswer === null ? null : question.correctAnswer,
    expected_answer: question.expectedAnswer || question.essentialConcepts.join("; "),
    rubric: normalizeRubric(question),
    explanation: question.explanation,
    difficulty: question.difficulty,
    source_references: question.sourceReferences.length ? question.sourceReferences : academic.sources.slice(0, 3).map((s) => s.sourceReference || s.topicName || s.unitName || "Compendio FATESCIPOL 2026"),
    validation_status: "validated",
    source_hash: hashText(`${question.questionText}\n${question.explanation}`),
    created_by: input.profile.id,
  }));

  const { data: inserted, error: questionError } = await db
    .from("assessment_questions")
    .insert(rows)
    .select("id,question_type,question_text,options,difficulty,source_references,explanation");
  if (questionError || !inserted?.length) throw new Error("No se pudieron guardar las preguntas.");

  const sessionRows = inserted.map((question, index) => ({
    assessment_session_id: session.id,
    question_id: question.id,
    question_order: index + 1,
    question_snapshot: sanitizeQuestionSnapshot(question, index + 1),
  }));
  const { error: linkError } = await db.from("assessment_session_questions").insert(sessionRows);
  if (linkError) throw new Error("No se pudieron asignar las preguntas.");

  return session.id as string;
}

async function generateQuestions(input: {
  profile: Profile;
  unit: { id: string; unit_number: number; unit_name: string };
  topic: { id: string; topic_name: string; topic_number: string | null } | null;
  topicName: string | null;
  questionTypes: AssessmentQuestionType[];
  difficulty: AssessmentDifficulty;
  count: number;
  context: string;
  sourceReferences: string[];
}) {
  const model = process.env.OPENAI_ASSESSMENT_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-terra";
  const completion = await generateTutorText({
    model,
    maxOutputTokens: 4200,
    system: "Eres un evaluador formativo de FATESCIPOL. Generas preguntas solo con base en el contexto del compendio. No inventas normas, artículos, fechas ni definiciones.",
    user: `Genera ${input.count} preguntas formativas en JSON estricto.\nUnidad: ${input.unit.unit_number} - ${input.unit.unit_name}\nTema: ${input.topicName || input.topic?.topic_name || "tema recuperado por RAG"}\nTipos permitidos: ${input.questionTypes.join(", ")}\nDificultad: ${input.difficulty}\n\nReglas:\n- Devuelve solo JSON con forma {"questions":[...]} sin markdown.\n- Cada pregunta debe tener questionType, questionText, options, correctAnswer, expectedAnswer, essentialConcepts, rubric, explanation, difficulty, sourceReferences.\n- multiple_choice: 4 opciones A-D y correctAnswer con la letra correcta.\n- true_false: correctAnswer booleano.\n- short_answer/open_answer/case_application: expectedAnswer y essentialConcepts.\n- Las explicaciones deben corregir con el contenido fuente, no ser genéricas.\n- Para casos, identifica que es caso didáctico generado.\n\nContexto oficial recuperado:\n${input.context}\n\nReferencias disponibles:\n${input.sourceReferences.slice(0, 6).join("\n")}`,
  });
  const parsed = parseQuestionJson(completion.text);
  await recordAIUsage({
    userId: input.profile.id,
    operationId: `assessment-generate:${hashText(completion.text)}:${Date.now()}`,
    operationType: "evaluation",
    model: completion.model,
    inputTokens: completion.inputTokens,
    outputTokens: completion.outputTokens,
    estimatedCostUsd: estimateTextCost(completion.inputTokens, completion.outputTokens),
    costIsEstimated: false,
  });
  return parsed;
}

function parseQuestionJson(text: string): GeneratedAssessmentQuestion[] {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("El generador no devolvió JSON utilizable.");
  const raw = JSON.parse(cleaned.slice(start, end + 1));
  const parsed = generatedQuestionListSchema.safeParse(raw);
  if (parsed.success) return parsed.data.questions;
  const repaired = generatedQuestionListSchema.safeParse({
    questions: normalizeQuestionCandidates(raw),
  });
  if (!repaired.success) throw new Error("Las preguntas generadas no tienen estructura válida.");
  return repaired.data.questions;
}

function normalizeQuestionCandidates(raw: unknown) {
  const source = raw as { questions?: unknown } | unknown[];
  const questions = Array.isArray(source) ? source : Array.isArray(source?.questions) ? source.questions : [];
  return questions.map((item, index) => normalizeQuestionCandidate(item, index));
}

function normalizeQuestionCandidate(item: unknown, index: number) {
  const row = (item || {}) as Record<string, unknown>;
  const questionType = normalizeQuestionType(row.questionType || row.question_type);
  const questionText = limitText(String(row.questionText || row.question || row.question_text || `Explique el concepto académico ${index + 1}.`), 850);
  const essentialConcepts = normalizeStringArray(row.essentialConcepts || row.essential_concepts || row.expectedConcepts).slice(0, 6);
  const expectedAnswer = limitText(String(row.expectedAnswer || row.expected_answer || row.correctAnswer || row.correct_answer || essentialConcepts.join("; ") || questionText), 1100);
  const explanation = limitText(String(row.explanation || row.explicacion || expectedAnswer), 1400);
  const options = normalizeOptions(row.options);
  const correctAnswer = normalizeCorrectAnswer(questionType, row.correctAnswer ?? row.correct_answer, options);
  return {
    questionType,
    questionText,
    options: questionType === "multiple_choice" ? options : [],
    correctAnswer,
    expectedAnswer: questionType === "multiple_choice" || questionType === "true_false" ? expectedAnswer : expectedAnswer,
    essentialConcepts: essentialConcepts.length ? essentialConcepts : extractConcepts(expectedAnswer),
    rubric: normalizeRubricCandidate(row.rubric || row.criteria || essentialConcepts),
    explanation,
    difficulty: normalizeDifficulty(row.difficulty),
    sourceReferences: normalizeStringArray(row.sourceReferences || row.source_references || row.sources).slice(0, 6).map((value) => limitText(value, 280)),
  };
}

function normalizeQuestionType(value: unknown): AssessmentQuestionType {
  const text = String(value || "open_answer");
  return assessmentQuestionTypes.includes(text as AssessmentQuestionType) ? (text as AssessmentQuestionType) : "open_answer";
}

function normalizeDifficulty(value: unknown): AssessmentDifficulty {
  const text = String(value || "basic");
  return ["basic", "intermediate", "advanced"].includes(text) ? (text as AssessmentDifficulty) : "basic";
}

function normalizeOptions(value: unknown) {
  const raw = Array.isArray(value) ? value : [];
  const options = raw.slice(0, 4).map((option, index) => {
    if (typeof option === "string") return { id: "ABCD"[index], text: limitText(option, 360) };
    const row = (option || {}) as Record<string, unknown>;
    return { id: String(row.id || "ABCD"[index]).slice(0, 1), text: limitText(String(row.text || row.label || row.value || `Opción ${index + 1}`), 360) };
  });
  while (options.length < 4) options.push({ id: "ABCD"[options.length], text: `Opción ${options.length + 1}` });
  return options;
}

function normalizeCorrectAnswer(questionType: AssessmentQuestionType, value: unknown, options: Array<{ id: string; text: string }>) {
  if (questionType === "true_false") return value === true || String(value).toLowerCase() === "true";
  if (questionType === "multiple_choice") {
    const answer = String(value || options[0]?.id || "A").trim().slice(0, 1).toUpperCase();
    return options.some((option) => option.id === answer) ? answer : options[0]?.id || "A";
  }
  return null;
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/[;\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function normalizeRubricCandidate(value: unknown) {
  if (Array.isArray(value) && value.length && typeof value[0] === "object") {
    return value.slice(0, 5).map((item, index) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        id: String(row.id || `c${index + 1}`).slice(0, 60),
        criterion: limitText(String(row.criterion || row.criteria || row.expected || `Criterio ${index + 1}`), 260),
        expected: row.expected ? limitText(String(row.expected), 480) : undefined,
        weight: normalizeWeight(row.weight, index, value.length),
      };
    });
  }
  return normalizeStringArray(value).slice(0, 4).map((concept, index, array) => ({
    id: `c${index + 1}`,
    criterion: limitText(concept, 260),
    expected: limitText(concept, 480),
    weight: normalizeWeight(null, index, array.length),
  }));
}

function normalizeWeight(value: unknown, index: number, total: number) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 1) return numeric;
  if (!total) return 1;
  return index === total - 1 ? Number((1 - (total - 1) * Number((1 / total).toFixed(2))).toFixed(2)) : Number((1 / total).toFixed(2));
}

function extractConcepts(text: string) {
  return text
    .split(/[.;:]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 3)
    .slice(0, 4);
}

function limitText(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? normalized.slice(0, max - 1).trim() : normalized;
}

function validateGeneratedQuestion(question: GeneratedAssessmentQuestion, allowed: AssessmentQuestionType[], difficulty: AssessmentDifficulty) {
  if (!allowed.includes(question.questionType)) return false;
  if (question.difficulty !== difficulty) question.difficulty = difficulty;
  if (question.questionType === "multiple_choice") {
    const ids = new Set(question.options.map((option) => option.id));
    return question.options.length === 4 && ids.size === 4 && typeof question.correctAnswer === "string" && ids.has(question.correctAnswer);
  }
  if (question.questionType === "true_false") return typeof question.correctAnswer === "boolean";
  return Boolean(question.expectedAnswer || question.essentialConcepts.length);
}

function normalizeRubric(question: GeneratedAssessmentQuestion) {
  if (question.rubric.length) return question.rubric;
  const concepts = question.essentialConcepts.slice(0, 4);
  if (!concepts.length) return [];
  const weight = Number((1 / concepts.length).toFixed(2));
  return concepts.map((concept, index) => ({ id: `c${index + 1}`, criterion: concept, expected: concept, weight }));
}

function sanitizeQuestionSnapshot(question: { id: string; question_type: string; question_text: string; options: unknown; difficulty: string; source_references: unknown }, order: number) {
  return {
    id: question.id,
    order,
    questionType: question.question_type,
    questionText: question.question_text,
    options: question.options || [],
    difficulty: question.difficulty,
    sourceReferences: question.source_references || [],
  };
}

function buildAssessmentQuery(unitNumber: number, unitName: string, topicName: string | null, difficulty: AssessmentDifficulty) {
  const verb = difficulty === "basic" ? "definiciones enumeraciones conceptos" : difficulty === "intermediate" ? "explicación relación características" : "aplicación caso procedimiento análisis";
  return `Unidad ${unitNumber} ${unitName}. ${topicName || "temas principales"}. ${verb}`;
}

async function getAcademicUnit(unitNumber: number) {
  const { data, error } = await createSupabaseAdmin()
    .from("academic_units")
    .select("id,unit_number,unit_name")
    .eq("unit_number", unitNumber)
    .single();
  if (error || !data) throw new Error("No se encontró la unidad académica.");
  return data as { id: string; unit_number: number; unit_name: string };
}

async function getAcademicTopic(topicId: string, unitId: string) {
  const { data, error } = await createSupabaseAdmin()
    .from("academic_topics")
    .select("id,topic_name,topic_number,academic_unit_id")
    .eq("id", topicId)
    .eq("academic_unit_id", unitId)
    .single();
  if (error || !data) throw new Error("No se encontró el tema académico seleccionado.");
  return data as { id: string; topic_name: string; topic_number: string | null; academic_unit_id: string };
}

function hashText(text: string) {
  return crypto.createHash("sha256").update(text.normalize("NFC")).digest("hex");
}
