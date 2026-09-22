export const ADAPTIVE_CALCULATION_VERSION = "adaptive-v1.0";

export type MasteryLevel =
  "INSUFFICIENT_EVIDENCE" | "INITIAL" | "DEVELOPING" | "CONSOLIDATED";
export type Difficulty = "basic" | "intermediate" | "advanced";
export type EvidenceResult = "correct" | "partial" | "incorrect" | "unknown";
export type LearningGapType =
  | "EVIDENCE_INSUFFICIENT"
  | "ISOLATED_ERROR"
  | "OBSERVED_DIFFICULTY"
  | "RECURRENT_DIFFICULTY"
  | "NO_GAP";
export type RecommendationType =
  | "REVIEW_TOPIC"
  | "PRACTICE_TOPIC"
  | "REVIEW_PREREQUISITE"
  | "CONTINUE_TOPIC"
  | "START_NEW_TOPIC"
  | "RETRY_ASSESSMENT";
export type RecommendationReasonCode =
  | "INSUFFICIENT_EVIDENCE"
  | "ISOLATED_ERROR"
  | "OBSERVED_DIFFICULTY"
  | "RECURRENT_DIFFICULTY"
  | "CONTINUE_RECENT_TOPIC"
  | "START_NEW_TOPIC"
  | "ADVANCE_DIFFICULTY";
export type RecommendationStatus =
  | "active"
  | "accepted"
  | "in_progress"
  | "completed"
  | "postponed"
  | "dismissed"
  | "expired";

export type NormalizedEvidence = {
  id: string;
  userId: string;
  knowledgeObjectId: string | null;
  topicId: string | null;
  unitId: string | null;
  result: EvidenceResult;
  score: number | null;
  maxScore: number | null;
  difficulty: Difficulty | null;
  source: "learning_evidence" | "assessment_answer" | "exam_answer";
  feedback: string | null;
  createdAt: string;
};

export type EvidenceGroupKey = {
  knowledgeObjectId: string | null;
  topicId: string | null;
  unitId: string | null;
};

export type MasteryEstimate = EvidenceGroupKey & {
  masteryScore: number;
  masteryLevel: MasteryLevel;
  evidenceCount: number;
  correctAnswers: number;
  partialAnswers: number;
  incorrectAnswers: number;
  lastAssessedAt: string | null;
  recommendedDifficulty: Difficulty;
  evidenceSnapshot: Record<string, unknown>;
};

export type LearningGap = EvidenceGroupKey & {
  gapType: LearningGapType;
  severity: number;
  reason: string;
  estimate: MasteryEstimate;
};

export type AdaptiveRecommendation = EvidenceGroupKey & {
  id?: string;
  recommendationType: RecommendationType;
  reasonCode: RecommendationReasonCode;
  priority: number;
  recommendedDifficulty: Difficulty | null;
  reason: string;
  status?: RecommendationStatus;
  title?: string;
  unitNumber?: number | null;
  unitName?: string | null;
  topicName?: string | null;
  evidenceSnapshot: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export function adaptiveScopeKey(input: EvidenceGroupKey) {
  return input.knowledgeObjectId || input.topicId || input.unitId || "unknown";
}
