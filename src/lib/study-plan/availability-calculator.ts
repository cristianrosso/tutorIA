import type {
  AvailabilitySummary,
  WeeklyAvailability,
} from "@/lib/study-plan/types";

export function calculateAvailableStudyTime(input: {
  startDate: string;
  examDate: string;
  weeklyAvailability: WeeklyAvailability;
  excludedDates?: string[];
}): AvailabilitySummary {
  const start = parseLocalDate(input.startDate);
  const end = parseLocalDate(input.examDate);
  if (end < start)
    throw new Error(
      "La fecha del examen no puede ser anterior al inicio del plan.",
    );
  const excluded = new Set(input.excludedDates || []);
  const days = [];
  const weeklyDistribution: Record<number, number> = {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
  };
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const date = formatLocalDate(cursor);
    if (excluded.has(date)) continue;
    const dayOfWeek = cursor.getDay();
    const config = input.weeklyAvailability[dayOfWeek];
    if (!config || config.availableMinutes <= 0) continue;
    days.push({
      date,
      dayOfWeek,
      availableMinutes: config.availableMinutes,
      preferredStartTime: config.preferredStartTime || null,
    });
    weeklyDistribution[dayOfWeek] += config.availableMinutes;
  }
  return {
    days,
    totalAvailableMinutes: days.reduce(
      (sum, day) => sum + day.availableMinutes,
      0,
    ),
    sessionCount: days.length,
    weeklyDistribution,
  };
}

export function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
