import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { generateLearningRecommendations } from "@/lib/adaptive/recommendation-engine";
import { calculateAvailableStudyTime } from "@/lib/study-plan/availability-calculator";
import { estimateWorkload } from "@/lib/study-plan/workload-estimator";
import {
  studyPlanInputSchema,
  type PlannedActivity,
  type StudyPlanInput,
  type StudyPlanProposal,
  type StudyTopic,
  type WeeklyAvailability,
} from "@/lib/study-plan/types";

export async function generateStudyPlan(
  input: StudyPlanInput & { userId: string },
): Promise<StudyPlanProposal> {
  const config = studyPlanInputSchema.parse(input);
  const weeklyAvailability = toWeeklyAvailability(config.availability);
  const availability = calculateAvailableStudyTime({
    startDate: config.startDate,
    examDate: config.examDate,
    weeklyAvailability,
  });
  if (!availability.days.length)
    throw new Error("Configura al menos un día disponible para estudiar.");
  const [topics, recommendations] = await Promise.all([
    loadSelectedTopics(input.userId, config),
    generateLearningRecommendations({ userId: input.userId, limit: 10 }).catch(
      () => [],
    ),
  ]);
  if (!topics.length)
    throw new Error(
      "No hay temas disponibles para las unidades seleccionadas.",
    );
  const recommended = new Map(
    recommendations.map((item) => [
      item.knowledgeObjectId || item.topicId || item.unitId || item.id || "",
      item,
    ]),
  );
  const enriched = topics.map((topic) => {
    const rec =
      recommended.get(topic.knowledgeObjectId || "") ||
      recommended.get(topic.topicId || "") ||
      recommended.get(topic.unitId);
    return {
      ...topic,
      adaptivePriority: rec
        ? Math.max(topic.adaptivePriority, rec.priority)
        : topic.adaptivePriority,
      sourceRecommendationId: rec?.id || topic.sourceRecommendationId,
      reviewNeeded:
        topic.reviewNeeded ||
        rec?.reasonCode === "OBSERVED_DIFFICULTY" ||
        rec?.reasonCode === "RECURRENT_DIFFICULTY",
    };
  });
  const ordered = orderTopics(enriched);
  const workload = estimateWorkload({
    topics: ordered,
    preferences: config.preferences,
  });
  const baseActivities = workload.items.flatMap((item) =>
    item.activities.map(
      (activity) =>
        ({
          knowledgeObjectId: item.knowledgeObjectId,
          unitId: item.unitId,
          topicId: item.topicId,
          activityType: activity.type,
          title: activity.title,
          scheduledDate: "",
          estimatedMinutes: activity.minutes,
          priority: activity.priority,
          sourceRecommendationId: item.sourceRecommendationId,
          actionPath: actionPath(activity.type, item.unitNumber),
        }) satisfies PlannedActivity,
    ),
  );
  const withSimulations = config.preferences.includeSimulations
    ? addSimulationActivities(
        baseActivities,
        ordered,
        config.preferences.simulationsPerWeek,
      )
    : baseActivities;
  const scheduled = scheduleActivities(
    withSimulations,
    availability.days,
    config.preferences.maxActivitiesPerDay,
  );
  const plannedMinutes = scheduled.reduce(
    (sum, activity) => sum + activity.estimatedMinutes,
    0,
  );
  const workloadMinutes = withSimulations.reduce(
    (sum, activity) => sum + activity.estimatedMinutes,
    0,
  );
  const insufficient =
    workloadMinutes > availability.totalAvailableMinutes ||
    scheduled.length < withSimulations.length;
  return {
    title: config.title,
    examDate: config.examDate,
    startDate: config.startDate,
    timezone: config.timezone,
    configuration: config,
    availability,
    workloadMinutes,
    plannedMinutes,
    insufficientTime: insufficient,
    warning: insufficient
      ? "Con la disponibilidad actual no es posible programar todas las actividades seleccionadas antes de la fecha prevista del examen."
      : null,
    activities: scheduled,
  };
}

export async function loadSelectedTopics(
  userId: string,
  config: StudyPlanInput,
): Promise<StudyTopic[]> {
  const db = createSupabaseAdmin();
  const unitQuery = db
    .from("academic_units")
    .select("id,unit_number,unit_name")
    .order("unit_number");
  const { data: units } = config.selectedUnitIds.length
    ? await unitQuery.in("id", config.selectedUnitIds)
    : config.selectedUnitNumbers.length
      ? await unitQuery.in("unit_number", config.selectedUnitNumbers)
      : await unitQuery.limit(15);
  const unitRows = units || [];
  const unitIds = unitRows.map((unit) => unit.id);
  if (!unitIds.length) return [];
  const [{ data: topics }, { data: objects }, { data: progress }] =
    await Promise.all([
      db
        .from("academic_topics")
        .select("id,academic_unit_id,topic_number,topic_name,sequence_index")
        .in("academic_unit_id", unitIds)
        .order("sequence_index", { ascending: true }),
      db
        .from("knowledge_objects")
        .select(
          "id,academic_unit_id,academic_topic_id,title,concept,content_type,source_content,active",
        )
        .in("academic_unit_id", unitIds)
        .eq("active", true)
        .limit(600),
      db
        .from("student_topic_progress")
        .select(
          "knowledge_object_id,topic_id,status,mastery_level,incorrect_answers,practice_attempts",
        )
        .eq("user_id", userId),
    ]);
  const unitsById = new Map(unitRows.map((unit) => [String(unit.id), unit]));
  const progressByKnowledge = new Map(
    (progress || []).map((row) => [
      String(row.knowledge_object_id || row.topic_id),
      row,
    ]),
  );
  const selectedTopicSet = new Set(config.selectedTopicIds || []);
  const primaryObjects = new Map<
    string,
    typeof objects extends Array<infer T> ? T : never
  >();
  for (const object of objects || []) {
    const topicKey = object.academic_topic_id
      ? String(object.academic_topic_id)
      : `object:${object.id}`;
    if (!primaryObjects.has(topicKey))
      primaryObjects.set(topicKey, object as never);
  }
  const rows: StudyTopic[] = [];
  for (const topic of topics || []) {
    if (selectedTopicSet.size && !selectedTopicSet.has(String(topic.id)))
      continue;
    const unit = unitsById.get(String(topic.academic_unit_id));
    if (!unit) continue;
    const object = primaryObjects.get(String(topic.id)) as
      Record<string, unknown> | undefined;
    const progressRow = progressByKnowledge.get(
      String(object?.id || topic.id),
    ) as Record<string, unknown> | undefined;
    rows.push({
      knowledgeObjectId: object?.id ? String(object.id) : null,
      unitId: String(unit.id),
      unitNumber: Number(unit.unit_number),
      unitName: String(unit.unit_name),
      topicId: String(topic.id),
      topicNumber: topic.topic_number ? String(topic.topic_number) : null,
      topicName: String(topic.topic_name),
      title: String(object?.title || topic.topic_name),
      contentType: object?.content_type ? String(object.content_type) : null,
      sourceLength: String(object?.source_content || "").length,
      sequenceIndex: Number(topic.sequence_index || 0),
      studied: Boolean(progressRow),
      reviewNeeded:
        progressRow?.status === "review_needed" ||
        Number(progressRow?.incorrect_answers || 0) >= 2,
      adaptivePriority: progressRow?.status === "review_needed" ? 35 : 0,
      sourceRecommendationId: null,
    });
  }
  return rows.slice(0, 180);
}

function toWeeklyAvailability(
  days: StudyPlanInput["availability"],
): WeeklyAvailability {
  return Object.fromEntries(
    days.map((day) => [
      day.dayOfWeek,
      {
        availableMinutes: day.availableMinutes,
        preferredStartTime: day.preferredStartTime,
      },
    ]),
  ) as WeeklyAvailability;
}

function orderTopics(topics: StudyTopic[]) {
  return [...topics].sort(
    (a, b) =>
      b.adaptivePriority - a.adaptivePriority ||
      Number(b.reviewNeeded) - Number(a.reviewNeeded) ||
      a.unitNumber - b.unitNumber ||
      a.sequenceIndex - b.sequenceIndex ||
      a.title.localeCompare(b.title, "es", { numeric: true }),
  );
}

function addSimulationActivities(
  activities: PlannedActivity[],
  topics: StudyTopic[],
  simulationsPerWeek: number,
) {
  if (!simulationsPerWeek || !topics.length) return activities;
  const units = [
    ...new Map(topics.map((topic) => [topic.unitId, topic])).values(),
  ];
  const simulations = units
    .slice(0, Math.max(1, Math.min(units.length, simulationsPerWeek * 4)))
    .map((unit) => ({
      knowledgeObjectId: null,
      unitId: unit.unitId,
      topicId: null,
      activityType: "EXAM_SIMULATION" as const,
      title: `Simulacro de Unidad ${unit.unitNumber}: ${unit.unitName}`,
      scheduledDate: "",
      estimatedMinutes: 45,
      priority: 58,
      sourceRecommendationId: null,
      actionPath: `/simulacro?unit=${unit.unitNumber}`,
    }));
  return [...activities, ...simulations];
}

function scheduleActivities(
  activities: PlannedActivity[],
  days: StudyPlanProposal["availability"]["days"],
  maxActivitiesPerDay: number,
) {
  const scheduled: PlannedActivity[] = [];
  const remaining = days.map((day) => ({
    ...day,
    remainingMinutes: day.availableMinutes,
    count: 0,
  }));
  const queue = [...activities].sort((a, b) => b.priority - a.priority);
  for (const activity of queue) {
    const slot = remaining.find(
      (day) =>
        day.remainingMinutes >= activity.estimatedMinutes &&
        day.count < maxActivitiesPerDay,
    );
    if (!slot) continue;
    scheduled.push({ ...activity, scheduledDate: slot.date });
    slot.remainingMinutes -= activity.estimatedMinutes;
    slot.count += 1;
  }
  return scheduled.sort(
    (a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate) || b.priority - a.priority,
  );
}

function actionPath(type: PlannedActivity["activityType"], unitNumber: number) {
  if (type === "PRACTICE_QUESTIONS" || type === "FORMATIVE_ASSESSMENT")
    return `/practica?unit=${unitNumber}`;
  if (type === "EXAM_SIMULATION") return `/simulacro?unit=${unitNumber}`;
  return `/tutor?unit=${unitNumber}`;
}
