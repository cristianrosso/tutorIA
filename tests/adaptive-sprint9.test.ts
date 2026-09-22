import { describe, expect, it } from "vitest";
import { estimateMasteryFromEvidence } from "@/lib/adaptive/mastery-estimator";
import { classifyGapFromEvidence } from "@/lib/adaptive/learning-gaps";
import type { NormalizedEvidence } from "@/lib/adaptive/types";

const base: Omit<NormalizedEvidence, "id" | "result" | "score" | "createdAt"> =
  {
    userId: "student-1",
    knowledgeObjectId: "U01-DOCTRINA-DISCIPLINA",
    topicId: "topic-1",
    unitId: "unit-1",
    maxScore: 1,
    difficulty: "basic",
    source: "assessment_answer",
    feedback: null,
  };

function evidence(
  result: NormalizedEvidence["result"],
  index: number,
  score?: number,
): NormalizedEvidence {
  return {
    ...base,
    id: `e-${index}`,
    result,
    score: score ?? (result === "correct" ? 1 : result === "partial" ? 0.5 : 0),
    createdAt: new Date(Date.UTC(2026, 8, 22, 12, index)).toISOString(),
  };
}

describe("Sprint 9 adaptive learning engine", () => {
  it("marks mastery as insufficient when there is only one evidence item", () => {
    const estimate = estimateMasteryFromEvidence([evidence("correct", 1)]);
    expect(estimate.masteryLevel).toBe("INSUFFICIENT_EVIDENCE");
    expect(estimate.evidenceCount).toBe(1);
  });

  it("detects recurrent difficulty from repeated incorrect evidence", () => {
    const gap = classifyGapFromEvidence([
      evidence("incorrect", 1),
      evidence("partial", 2),
      evidence("incorrect", 3),
    ]);
    expect(gap.gapType).toBe("RECURRENT_DIFFICULTY");
    expect(gap.severity).toBeGreaterThan(70);
  });

  it("detects an isolated error without calling it recurrent difficulty", () => {
    const gap = classifyGapFromEvidence([
      evidence("correct", 1),
      evidence("incorrect", 2),
      evidence("correct", 3),
    ]);
    expect(gap.gapType).toBe("ISOLATED_ERROR");
  });

  it("consolidates mastery only with enough consistent evidence", () => {
    const estimate = estimateMasteryFromEvidence([
      { ...evidence("correct", 1), difficulty: "intermediate" },
      { ...evidence("correct", 2), difficulty: "intermediate" },
      { ...evidence("correct", 3), difficulty: "advanced" },
      { ...evidence("correct", 4), difficulty: "basic" },
    ]);
    expect(estimate.masteryLevel).toBe("CONSOLIDATED");
    expect(estimate.recommendedDifficulty).toBe("advanced");
  });
});
