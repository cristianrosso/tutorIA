import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { calculateAvailableStudyTime } from "@/lib/study-plan/availability-calculator";
import { generateStudyPlan } from "@/lib/study-plan/schedule-generator";
import {
  studyPlanInputSchema,
  type PlannedActivity,
  type StudyActivityStatus,
  type StudyPlanInput,
  type StudyPlanStatus,
} from "@/lib/study-plan/types";

export async function createStudyPlanDraft(userId: string, rawInput: unknown) {
  const input = studyPlanInputSchema.parse(rawInput);
  const proposal = await generateStudyPlan({ ...input, userId });
  const db = createSupabaseAdmin();
  const { data: plan, error } = await db
    .from("student_study_plans")
    .insert({
      user_id: userId,
      title: proposal.title,
      exam_date: proposal.examDate,
      start_date: proposal.startDate,
      timezone: proposal.timezone,
      status: "draft",
      configuration: proposal.configuration,
      selected_unit_ids: input.selectedUnitIds,
      selected_topic_ids: input.selectedTopicIds,
      total_available_minutes: proposal.availability.totalAvailableMinutes,
      total_planned_minutes: proposal.plannedMinutes,
      insufficiency_warning: proposal.warning,
    })
    .select("id")
    .single();
  if (error || !plan) throw new Error("No se pudo crear el plan de estudio.");
  await db.from("student_study_availability").insert(
    input.availability.map((day) => ({
      study_plan_id: plan.id,
      day_of_week: day.dayOfWeek,
      available_minutes: day.availableMinutes,
      preferred_start_time: day.preferredStartTime || null,
    })),
  );
  await insertActivities(userId, plan.id, proposal.activities);
  await recordRevision(
    userId,
    plan.id,
    "draft_created",
    {},
    { configuration: input, activities: proposal.activities.length },
  );
  return getStudyPlan(userId, plan.id);
}

export async function getCurrentStudyPlan(userId: string) {
  const { data } = await createSupabaseAdmin()
    .from("student_study_plans")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "draft", "paused"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ? getStudyPlan(userId, data.id) : null;
}

export async function getStudyPlan(userId: string, planId: string) {
  const db = createSupabaseAdmin();
  const [
    { data: plan, error },
    { data: availability },
    { data: activities },
    { data: revisions },
  ] = await Promise.all([
    db
      .from("student_study_plans")
      .select("*")
      .eq("id", planId)
      .eq("user_id", userId)
      .single(),
    db
      .from("student_study_availability")
      .select("*")
      .eq("study_plan_id", planId)
      .order("day_of_week"),
    db
      .from("student_study_activities")
      .select("*")
      .eq("study_plan_id", planId)
      .eq("user_id", userId)
      .order("scheduled_date", { ascending: true })
      .order("priority", { ascending: false }),
    db
      .from("student_study_plan_revisions")
      .select("revision_number,change_reason,created_at")
      .eq("study_plan_id", planId)
      .eq("user_id", userId)
      .order("revision_number", { ascending: false })
      .limit(8),
  ]);
  if (error || !plan) throw new Error("No se encontró el plan de estudio.");
  const activityRows = activities || [];
  const completed = activityRows.filter((item) => item.status === "completed");
  const today = localToday();
  return {
    plan,
    availability: availability || [],
    activities: activityRows,
    revisions: revisions || [],
    summary: {
      scheduledActivities: activityRows.length,
      completedActivities: completed.length,
      pendingActivities: activityRows.filter(
        (item) => item.status === "pending" || item.status === "postponed",
      ).length,
      completedMinutes: completed.reduce(
        (sum, item) =>
          sum + Number(item.actual_minutes || item.estimated_minutes || 0),
        0,
      ),
      plannedMinutes: activityRows.reduce(
        (sum, item) => sum + Number(item.estimated_minutes || 0),
        0,
      ),
      todayMinutes: activityRows
        .filter((item) => item.scheduled_date === today)
        .reduce((sum, item) => sum + Number(item.estimated_minutes || 0), 0),
      todayActivities: activityRows.filter(
        (item) => item.scheduled_date === today,
      ),
    },
  };
}

export async function updateStudyPlan(
  userId: string,
  planId: string,
  input: { status?: StudyPlanStatus; title?: string; examDate?: string },
) {
  const current = await getStudyPlan(userId, planId);
  const currentStatus = String(current.plan.status) as StudyPlanStatus;
  const nextStatus = input.status || currentStatus;
  if (!isValidTransition(currentStatus, nextStatus))
    throw new Error("Cambio de estado no permitido.");
  const update: Record<string, unknown> = {};
  if (input.status) update.status = input.status;
  if (input.title) update.title = input.title;
  if (input.examDate) update.exam_date = input.examDate;
  await createSupabaseAdmin()
    .from("student_study_plans")
    .update(update)
    .eq("id", planId)
    .eq("user_id", userId);
  await recordRevision(
    userId,
    planId,
    "plan_updated",
    current.plan.configuration || {},
    { update },
  );
  return getStudyPlan(userId, planId);
}

export async function completeStudyActivity(
  userId: string,
  planId: string,
  activityId: string,
  actualMinutes?: number,
) {
  const db = createSupabaseAdmin();
  const { data, error } = await db
    .from("student_study_activities")
    .update({
      status: "completed",
      actual_minutes: actualMinutes || null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", activityId)
    .eq("study_plan_id", planId)
    .eq("user_id", userId)
    .neq("status", "completed")
    .select("id")
    .single();
  if (error || !data) throw new Error("No se pudo completar la actividad.");
  await recordRevision(
    userId,
    planId,
    "activity_completed",
    {},
    { activityId, actualMinutes },
  );
  return getStudyPlan(userId, planId);
}

export async function updateStudyActivityStatus(
  userId: string,
  planId: string,
  activityId: string,
  status: StudyActivityStatus,
) {
  if (status === "completed")
    return completeStudyActivity(userId, planId, activityId);
  const { error } = await createSupabaseAdmin()
    .from("student_study_activities")
    .update({ status, completed_at: null })
    .eq("id", activityId)
    .eq("study_plan_id", planId)
    .eq("user_id", userId);
  if (error) throw new Error("No se pudo actualizar la actividad.");
  await recordRevision(
    userId,
    planId,
    `activity_${status}`,
    {},
    { activityId, status },
  );
  return getStudyPlan(userId, planId);
}

export async function proposeStudyPlanAdjustment(
  userId: string,
  planId: string,
  reason: string,
) {
  const detail = await getStudyPlan(userId, planId);
  const configuration = detail.plan.configuration as StudyPlanInput;
  const availability = calculateAvailableStudyTime({
    startDate: localToday(),
    examDate: String(detail.plan.exam_date),
    weeklyAvailability: Object.fromEntries(
      (detail.availability || []).map((day) => [
        Number(day.day_of_week),
        {
          availableMinutes: Number(day.available_minutes),
          preferredStartTime: day.preferred_start_time || null,
        },
      ]),
    ),
  });
  const movable = detail.activities.filter(
    (activity) =>
      activity.status !== "completed" && activity.status !== "cancelled",
  );
  const scheduled = rescheduleActivities(
    movable,
    availability.days,
    configuration.preferences?.maxActivitiesPerDay || 4,
  );
  return {
    reason,
    affectedActivities: movable.length,
    proposedActivities: scheduled,
    warning:
      scheduled.length < movable.length
        ? "No todas las actividades pendientes caben en la disponibilidad restante."
        : null,
  };
}

export async function applyStudyPlanAdjustment(
  userId: string,
  planId: string,
  reason: string,
) {
  const proposal = await proposeStudyPlanAdjustment(userId, planId, reason);
  const db = createSupabaseAdmin();
  for (const activity of proposal.proposedActivities) {
    await db
      .from("student_study_activities")
      .update({
        scheduled_date: activity.scheduledDate,
        status: activity.status === "completed" ? "completed" : "pending",
      })
      .eq("id", activity.id)
      .eq("study_plan_id", planId)
      .eq("user_id", userId)
      .neq("status", "completed");
  }
  await recordRevision(userId, planId, reason || "rescheduled", {}, proposal);
  return getStudyPlan(userId, planId);
}

async function insertActivities(
  userId: string,
  planId: string,
  activities: PlannedActivity[],
) {
  if (!activities.length) return;
  const { error } = await createSupabaseAdmin()
    .from("student_study_activities")
    .insert(
      activities.map((activity) => ({
        study_plan_id: planId,
        user_id: userId,
        knowledge_object_id: activity.knowledgeObjectId,
        unit_id: activity.unitId,
        topic_id: activity.topicId,
        activity_type: activity.activityType,
        title: activity.title,
        scheduled_date: activity.scheduledDate,
        estimated_minutes: activity.estimatedMinutes,
        status: "pending",
        priority: activity.priority,
        source_recommendation_id: activity.sourceRecommendationId,
        action_path: activity.actionPath,
      })),
    );
  if (error)
    throw new Error("No se pudieron guardar las actividades del plan.");
}

async function recordRevision(
  userId: string,
  planId: string,
  reason: string,
  previousConfiguration: unknown,
  updatedConfiguration: unknown,
) {
  const db = createSupabaseAdmin();
  const { count } = await db
    .from("student_study_plan_revisions")
    .select("id", { count: "exact", head: true })
    .eq("study_plan_id", planId);
  await db.from("student_study_plan_revisions").insert({
    study_plan_id: planId,
    user_id: userId,
    revision_number: (count || 0) + 1,
    change_reason: reason,
    previous_configuration: previousConfiguration || {},
    updated_configuration: updatedConfiguration || {},
  });
}

function rescheduleActivities(
  activities: Array<Record<string, unknown>>,
  days: Array<{ date: string; availableMinutes: number }>,
  maxActivitiesPerDay: number,
) {
  const slots = days.map((day) => ({
    ...day,
    remainingMinutes: day.availableMinutes,
    count: 0,
  }));
  const result: Array<Record<string, unknown> & { scheduledDate: string }> = [];
  for (const activity of activities.sort(
    (a, b) => Number(b.priority || 0) - Number(a.priority || 0),
  )) {
    const minutes = Number(activity.estimated_minutes || 0);
    const slot = slots.find(
      (day) =>
        day.remainingMinutes >= minutes && day.count < maxActivitiesPerDay,
    );
    if (!slot) continue;
    result.push({ ...activity, scheduledDate: slot.date });
    slot.remainingMinutes -= minutes;
    slot.count += 1;
  }
  return result;
}

function isValidTransition(from: StudyPlanStatus, to: StudyPlanStatus) {
  if (from === to) return true;
  const allowed: Record<StudyPlanStatus, StudyPlanStatus[]> = {
    draft: ["active", "cancelled"],
    active: ["paused", "completed", "cancelled", "expired"],
    paused: ["active", "cancelled"],
    completed: [],
    cancelled: [],
    expired: ["active", "cancelled"],
  };
  return allowed[from].includes(to);
}

function localToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
