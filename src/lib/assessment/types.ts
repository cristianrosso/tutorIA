import { z } from "zod";

export const assessmentQuestionTypes = [
  "multiple_choice",
  "true_false",
  "short_answer",
  "open_answer",
  "case_application",
] as const;

export const assessmentDifficulties = ["basic", "intermediate", "advanced"] as const;
export const assessmentResults = ["correct", "partially_correct", "incorrect", "requires_review"] as const;

export type AssessmentQuestionType = (typeof assessmentQuestionTypes)[number];
export type AssessmentDifficulty = (typeof assessmentDifficulties)[number];
export type AssessmentResult = (typeof assessmentResults)[number];

export const optionSchema = z.object({
  id: z.string().min(1).max(4),
  text: z.string().trim().min(2).max(400),
});

export const rubricCriterionSchema = z.object({
  id: z.string().trim().min(1).max(60),
  criterion: z.string().trim().min(4).max(280),
  expected: z.string().trim().min(3).max(500).optional(),
  weight: z.number().min(0).max(1),
});

export const generatedQuestionSchema = z.object({
  questionType: z.enum(assessmentQuestionTypes),
  questionText: z.string().trim().min(10).max(900),
  options: z.array(optionSchema).default([]),
  correctAnswer: z.union([z.string(), z.boolean(), z.array(z.string())]).nullable().default(null),
  expectedAnswer: z.string().trim().min(2).max(1200).optional().nullable(),
  essentialConcepts: z.array(z.string().trim().min(2).max(120)).default([]),
  rubric: z.array(rubricCriterionSchema).default([]),
  explanation: z.string().trim().min(10).max(1500),
  difficulty: z.enum(assessmentDifficulties),
  sourceReferences: z.array(z.string().trim().min(2).max(300)).default([]),
});

export const generatedQuestionListSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1).max(20),
});

export type GeneratedAssessmentQuestion = z.infer<typeof generatedQuestionSchema>;
export type AssessmentOption = z.infer<typeof optionSchema>;
export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

export type PublicAssessmentQuestion = {
  id: string;
  order: number;
  questionType: AssessmentQuestionType;
  questionText: string;
  options: AssessmentOption[];
  difficulty: AssessmentDifficulty;
  sourceReferences: string[];
  answered: boolean;
  feedback?: GradingFeedback;
};

export type GradingFeedback = {
  result: AssessmentResult;
  score: number;
  maxScore: number;
  gradingMethod: "deterministic" | "semantic_rules" | "ai_rubric" | "manual_review";
  gradingConfidence: number;
  correctAnswer?: string;
  explanation: string;
  whatWasGood: string[];
  missingConcepts: string[];
  correction: string;
  reinforce: string[];
  sourceReferences: string[];
};

export type AssessmentSessionPublic = {
  id: string;
  status: "created" | "in_progress" | "completed" | "abandoned";
  unitName: string | null;
  topicName: string | null;
  questionType: string;
  difficulty: AssessmentDifficulty;
  totalQuestions: number;
  answeredQuestions: number;
  correctAnswers: number;
  partialAnswers: number;
  incorrectAnswers: number;
  totalScore: number;
  maxScore: number;
  startedAt: string;
  completedAt: string | null;
  questions: PublicAssessmentQuestion[];
};

export function normalizeForCompare(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeJsonArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
