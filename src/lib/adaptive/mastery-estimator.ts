import type {
  Difficulty,
  MasteryEstimate,
  MasteryLevel,
  NormalizedEvidence,
} from "@/lib/adaptive/types";
import { ADAPTIVE_CALCULATION_VERSION } from "@/lib/adaptive/types";

const MIN_EVIDENCE_FOR_MASTERY = 2;
const MIN_EVIDENCE_FOR_CONSOLIDATED = 4;

export function estimateMasteryFromEvidence(
  evidence: NormalizedEvidence[],
): MasteryEstimate {
  const sorted = [...evidence].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  const first = sorted[0];
  const key = {
    knowledgeObjectId: first?.knowledgeObjectId || null,
    topicId: first?.topicId || null,
    unitId: first?.unitId || null,
  };
  const correctAnswers = sorted.filter(
    (item) => item.result === "correct",
  ).length;
  const partialAnswers = sorted.filter(
    (item) => item.result === "partial",
  ).length;
  const incorrectAnswers = sorted.filter(
    (item) => item.result === "incorrect",
  ).length;
  const evidenceCount = sorted.length;
  const weightedScore = calculateWeightedScore(sorted);
  const recent = sorted.slice(0, 3);
  const recentProblems = recent.filter(
    (item) => item.result === "incorrect" || item.result === "partial",
  ).length;
  const masteryScore = evidenceCount ? clampScore(weightedScore) : 0;
  const masteryLevel = chooseMasteryLevel({
    evidenceCount,
    masteryScore,
    recentProblems,
  });
  return {
    ...key,
    masteryScore,
    masteryLevel,
    evidenceCount,
    correctAnswers,
    partialAnswers,
    incorrectAnswers,
    lastAssessedAt: first?.createdAt || null,
    recommendedDifficulty: recommendedDifficulty({
      evidenceCount,
      masteryScore,
      masteryLevel,
      sorted,
    }),
    evidenceSnapshot: {
      calculationVersion: ADAPTIVE_CALCULATION_VERSION,
      evidenceCount,
      correctAnswers,
      partialAnswers,
      incorrectAnswers,
      recentResults: recent.map((item) => item.result),
      sources: [...new Set(sorted.map((item) => item.source))],
    },
  };
}

function calculateWeightedScore(evidence: NormalizedEvidence[]) {
  let total = 0;
  let weights = 0;
  for (const [index, item] of evidence.entries()) {
    const base = scoreValue(item);
    const recency = Math.max(0.72, 1 - index * 0.04);
    const difficulty =
      item.difficulty === "advanced"
        ? 1.3
        : item.difficulty === "intermediate"
          ? 1.15
          : 1;
    const weight = recency * difficulty;
    total += base * weight;
    weights += weight;
  }
  return weights ? (total / weights) * 100 : 0;
}

function scoreValue(item: NormalizedEvidence) {
  if (item.maxScore && item.maxScore > 0 && item.score !== null) {
    return Math.max(0, Math.min(1, item.score / item.maxScore));
  }
  if (item.result === "correct") return 1;
  if (item.result === "partial") return 0.5;
  if (item.result === "incorrect") return 0;
  return 0.25;
}

function chooseMasteryLevel(input: {
  evidenceCount: number;
  masteryScore: number;
  recentProblems: number;
}): MasteryLevel {
  if (input.evidenceCount < MIN_EVIDENCE_FOR_MASTERY)
    return "INSUFFICIENT_EVIDENCE";
  if (input.masteryScore < 45) return "INITIAL";
  if (
    input.masteryScore >= 80 &&
    input.evidenceCount >= MIN_EVIDENCE_FOR_CONSOLIDATED &&
    input.recentProblems === 0
  )
    return "CONSOLIDATED";
  return "DEVELOPING";
}

function recommendedDifficulty(input: {
  evidenceCount: number;
  masteryScore: number;
  masteryLevel: MasteryLevel;
  sorted: NormalizedEvidence[];
}): Difficulty {
  if (input.evidenceCount < MIN_EVIDENCE_FOR_MASTERY || input.masteryScore < 55)
    return "basic";
  const hasIntermediate = input.sorted.some(
    (item) =>
      item.difficulty === "intermediate" || item.difficulty === "advanced",
  );
  if (input.masteryScore >= 82 && hasIntermediate) return "advanced";
  if (input.masteryScore >= 70) return "intermediate";
  return "basic";
}

function clampScore(score: number) {
  return Number(Math.max(0, Math.min(100, score)).toFixed(2));
}
