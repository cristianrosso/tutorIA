import type {
  StudyActivityType,
  StudyPlanPreferences,
  StudyTopic,
} from "@/lib/study-plan/types";

export type WorkloadItem = StudyTopic & {
  baseMinutes: number;
  activities: Array<{
    type: StudyActivityType;
    minutes: number;
    priority: number;
    title: string;
  }>;
};

export function estimateWorkload(input: {
  topics: StudyTopic[];
  preferences: StudyPlanPreferences;
}) {
  const items = input.topics.map((topic) =>
    buildWorkloadItem(topic, input.preferences),
  );
  return {
    items,
    totalMinutes: items.reduce(
      (sum, item) =>
        sum +
        item.activities.reduce(
          (inner, activity) => inner + activity.minutes,
          0,
        ),
      0,
    ),
  };
}

function buildWorkloadItem(
  topic: StudyTopic,
  preferences: StudyPlanPreferences,
): WorkloadItem {
  const contentFactor = Math.min(
    35,
    Math.max(0, Math.round(topic.sourceLength / 900)),
  );
  const base = topic.studied ? 25 : 40;
  const complexity =
    topic.contentType === "PROCEDURE" ||
    topic.contentType === "NORMATIVE" ||
    topic.contentType === "ARTICLE"
      ? 15
      : topic.contentType === "ENUMERATION"
        ? 10
        : 5;
  const baseMinutes = clampToBlock(base + contentFactor + complexity, 20, 90);
  const priority = Math.max(
    35,
    Math.min(
      100,
      45 +
        topic.adaptivePriority +
        (topic.reviewNeeded ? 25 : 0) +
        (topic.studied ? -10 : 10),
    ),
  );
  const activities: WorkloadItem["activities"] = [
    {
      type: topic.studied ? "REVIEW_TOPIC" : "STUDY_TOPIC",
      minutes: baseMinutes,
      priority,
      title: topic.studied
        ? `Repasar ${topic.title}`
        : `Estudiar ${topic.title}`,
    },
  ];
  const reviewMinutes =
    preferences.reviewIntensity === "high"
      ? 25
      : preferences.reviewIntensity === "low"
        ? 10
        : 15;
  if (topic.reviewNeeded || topic.adaptivePriority >= 50) {
    activities.push({
      type: "REVIEW_MISTAKES",
      minutes: reviewMinutes,
      priority: Math.min(100, priority + 8),
      title: `Revisar errores de ${topic.title}`,
    });
  }
  activities.push({
    type: "PRACTICE_QUESTIONS",
    minutes: topic.reviewNeeded ? 30 : 20,
    priority: Math.min(100, priority + 4),
    title: `Practicar preguntas de ${topic.title}`,
  });
  if (preferences.includeFormativeAssessments && priority >= 70) {
    activities.push({
      type: "FORMATIVE_ASSESSMENT",
      minutes: 25,
      priority: Math.min(100, priority + 6),
      title: `Evaluación formativa de ${topic.title}`,
    });
  }
  return { ...topic, baseMinutes, activities };
}

function clampToBlock(value: number, min: number, max: number) {
  const rounded = Math.ceil(value / 5) * 5;
  return Math.max(min, Math.min(max, rounded));
}
