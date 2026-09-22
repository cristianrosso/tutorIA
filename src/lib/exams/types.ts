import { z } from "zod";
import { assessmentDifficulties, assessmentQuestionTypes, type AssessmentDifficulty, type AssessmentQuestionType } from "@/lib/assessment/types";

export const examModes = ["topic", "unit", "integral", "tribunal"] as const;
export const examStatuses = ["draft", "ready", "in_progress", "submitted", "grading", "completed", "grading_failed", "expired", "cancelled"] as const;

export type ExamMode = (typeof examModes)[number];
export type ExamStatus = (typeof examStatuses)[number];

export const createExamSchema = z.object({
  examMode: z.enum(examModes).default("tribunal"),
  unitNumbers: z.array(z.coerce.number().int().min(1).max(15)).min(1).max(15).default([1]),
  topicId: z.uuid().optional().nullable(),
  topicName: z.string().trim().max(180).optional().nullable(),
  questionType: z.union([z.enum(assessmentQuestionTypes), z.literal("mixed")]).default("open_answer"),
  difficulty: z.union([z.enum(assessmentDifficulties), z.literal("mixed")]).default("basic"),
  count: z.coerce.number().int().min(1).max(50).default(5),
  durationMinutes: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60), z.literal(90)]).default(0),
});

export type CreateExamConfig = z.infer<typeof createExamSchema>;

export type PublicExamQuestion = {
  id: string;
  questionId: string;
  order: number;
  questionType: AssessmentQuestionType;
  questionText: string;
  options: Array<{ id: string; text: string }>;
  difficulty: AssessmentDifficulty;
  sourceReferences: string[];
  answer: string | boolean | null;
  answered: boolean;
  feedback?: unknown;
  score?: number | null;
  gradingStatus?: string;
};

export type PublicExamSession = {
  id: string;
  examMode: ExamMode;
  status: ExamStatus;
  configuration: CreateExamConfig & Record<string, unknown>;
  totalQuestions: number;
  answeredQuestions: number;
  durationSeconds: number | null;
  startedAt: string | null;
  deadlineAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  totalScore: number;
  maxScore: number;
  percentage: number;
  questions: PublicExamQuestion[];
  recommendations: string[];
};

export function distributeCounts(total: number, units: number[]) {
  const unique = [...new Set(units)].slice(0, Math.max(1, total));
  const base = Math.floor(total / unique.length);
  let rest = total % unique.length;
  return unique.map((unitNumber) => ({ unitNumber, count: base + (rest-- > 0 ? 1 : 0) })).filter((item) => item.count > 0);
}

export function normalizeExamDifficulty(value: CreateExamConfig["difficulty"], index: number): AssessmentDifficulty {
  if (value !== "mixed") return value;
  return (["basic", "intermediate", "advanced"] as const)[index % 3];
}

export function normalizeExamQuestionType(value: CreateExamConfig["questionType"], mode: ExamMode): AssessmentQuestionType | "mixed" {
  if (mode === "tribunal") return "open_answer";
  return value;
}
