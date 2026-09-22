import { z } from "zod";

export const activityTypes = [
  "STUDY_TOPIC",
  "REVIEW_TOPIC",
  "PRACTICE_QUESTIONS",
  "FORMATIVE_ASSESSMENT",
  "EXAM_SIMULATION",
  "REVIEW_MISTAKES",
] as const;
export const planStatuses = [
  "draft",
  "active",
  "paused",
  "completed",
  "cancelled",
  "expired",
] as const;
export const activityStatuses = [
  "pending",
  "in_progress",
  "completed",
  "postponed",
  "skipped",
  "cancelled",
] as const;

export type StudyActivityType = (typeof activityTypes)[number];
export type StudyPlanStatus = (typeof planStatuses)[number];
export type StudyActivityStatus = (typeof activityStatuses)[number];

export type WeeklyAvailability = Record<
  number,
  { availableMinutes: number; preferredStartTime?: string | null }
>;

export const availabilityDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  availableMinutes: z.number().int().min(0).max(720),
  preferredStartTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .nullable(),
});

export const studyPlanInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .default("Plan de estudio FATESCIPOL"),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().trim().min(3).default("America/La_Paz"),
  availability: z.array(availabilityDaySchema).min(1),
  selectedUnitIds: z.array(z.uuid()).default([]),
  selectedUnitNumbers: z.array(z.number().int().min(1).max(15)).default([]),
  selectedTopicIds: z.array(z.uuid()).default([]),
  preferences: z
    .object({
      reviewIntensity: z.enum(["low", "normal", "high"]).default("normal"),
      includeSimulations: z.boolean().default(true),
      simulationsPerWeek: z.number().int().min(0).max(3).default(1),
      includeFormativeAssessments: z.boolean().default(true),
      maxActivitiesPerDay: z.number().int().min(1).max(6).default(4),
    })
    .default({
      reviewIntensity: "normal",
      includeSimulations: true,
      simulationsPerWeek: 1,
      includeFormativeAssessments: true,
      maxActivitiesPerDay: 4,
    }),
});

export const updatePlanSchema = z.object({
  status: z.enum(planStatuses).optional(),
  title: z.string().trim().min(3).max(120).optional(),
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type StudyPlanInput = z.infer<typeof studyPlanInputSchema>;
export type StudyPlanPreferences = StudyPlanInput["preferences"];

export type StudyTopic = {
  knowledgeObjectId: string | null;
  unitId: string;
  unitNumber: number;
  unitName: string;
  topicId: string | null;
  topicNumber: string | null;
  topicName: string;
  title: string;
  contentType: string | null;
  sourceLength: number;
  sequenceIndex: number;
  studied: boolean;
  reviewNeeded: boolean;
  adaptivePriority: number;
  sourceRecommendationId: string | null;
};

export type AvailableStudyDay = {
  date: string;
  dayOfWeek: number;
  availableMinutes: number;
  preferredStartTime: string | null;
};

export type AvailabilitySummary = {
  days: AvailableStudyDay[];
  totalAvailableMinutes: number;
  sessionCount: number;
  weeklyDistribution: Record<number, number>;
};

export type PlannedActivity = {
  knowledgeObjectId: string | null;
  unitId: string | null;
  topicId: string | null;
  activityType: StudyActivityType;
  title: string;
  scheduledDate: string;
  estimatedMinutes: number;
  priority: number;
  sourceRecommendationId: string | null;
  actionPath: string;
};

export type StudyPlanProposal = {
  title: string;
  examDate: string;
  startDate: string;
  timezone: string;
  configuration: StudyPlanInput;
  availability: AvailabilitySummary;
  workloadMinutes: number;
  plannedMinutes: number;
  insufficientTime: boolean;
  warning: string | null;
  activities: PlannedActivity[];
};
