import { describe, expect, it } from "vitest";
import { calculateAvailableStudyTime } from "@/lib/study-plan/availability-calculator";
import { estimateWorkload } from "@/lib/study-plan/workload-estimator";
import type { StudyTopic } from "@/lib/study-plan/types";

const topic: StudyTopic = {
  knowledgeObjectId: "U01-DOCTRINA",
  unitId: "unit-1",
  unitNumber: 1,
  unitName: "Doctrina Policial",
  topicId: "topic-1",
  topicNumber: "1.1",
  topicName: "Doctrina Policial",
  title: "Doctrina Policial",
  contentType: "DEFINITION",
  sourceLength: 1600,
  sequenceIndex: 1,
  studied: false,
  reviewNeeded: false,
  adaptivePriority: 0,
  sourceRecommendationId: null,
};

describe("Sprint 10 study planner", () => {
  it("calculates available time while respecting rest days", () => {
    const availability = calculateAvailableStudyTime({
      startDate: "2026-10-05",
      examDate: "2026-10-11",
      weeklyAvailability: {
        1: { availableMinutes: 120 },
        2: { availableMinutes: 120 },
        3: { availableMinutes: 60 },
        4: { availableMinutes: 120 },
        5: { availableMinutes: 120 },
        6: { availableMinutes: 180 },
      },
    });
    expect(availability.sessionCount).toBe(6);
    expect(availability.totalAvailableMinutes).toBe(720);
    expect(availability.days.some((day) => day.dayOfWeek === 0)).toBe(false);
  });

  it("rejects an exam date before the start date", () => {
    expect(() =>
      calculateAvailableStudyTime({
        startDate: "2026-10-10",
        examDate: "2026-10-01",
        weeklyAvailability: { 1: { availableMinutes: 120 } },
      }),
    ).toThrow(/anterior/);
  });

  it("adds reinforcement workload for topics with recurrent difficulty", () => {
    const workload = estimateWorkload({
      topics: [
        { ...topic, reviewNeeded: true, adaptivePriority: 80, studied: true },
      ],
      preferences: {
        reviewIntensity: "high",
        includeSimulations: true,
        simulationsPerWeek: 1,
        includeFormativeAssessments: true,
        maxActivitiesPerDay: 4,
      },
    });
    const types = workload.items[0].activities.map((activity) => activity.type);
    expect(types).toContain("REVIEW_MISTAKES");
    expect(types).toContain("FORMATIVE_ASSESSMENT");
  });

  it("keeps a light consolidation activity for studied content", () => {
    const workload = estimateWorkload({
      topics: [{ ...topic, studied: true }],
      preferences: {
        reviewIntensity: "normal",
        includeSimulations: false,
        simulationsPerWeek: 0,
        includeFormativeAssessments: true,
        maxActivitiesPerDay: 3,
      },
    });
    expect(workload.items[0].activities[0].type).toBe("REVIEW_TOPIC");
  });
});
