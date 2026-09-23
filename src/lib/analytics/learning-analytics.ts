import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export type AnalyticsPeriod = "7d" | "30d" | "40d" | "all";
export type AnalyticsFilters = {
  period?: AnalyticsPeriod;
  unitId?: string | null;
  topicId?: string | null;
};

type Row = Record<string, unknown>;
type RowsResult = { data: Row[] | null; error: { message?: string } | null };
type QueryLike<T> = PromiseLike<T> & {
  select: (...args: unknown[]) => QueryLike<T>;
  eq: (...args: unknown[]) => QueryLike<T>;
  gte: (...args: unknown[]) => QueryLike<T>;
  in: (...args: unknown[]) => QueryLike<T>;
  order: (...args: unknown[]) => QueryLike<T>;
  limit: (...args: unknown[]) => QueryLike<T>;
};

type UnitLabel = { id: string; unitNumber: number; unitName: string };

export function periodStart(period: AnalyticsPeriod = "40d") {
  if (period === "all") return null;
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 40;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function percentage(score: unknown, maxScore: unknown) {
  const scoreNumber = Number(score || 0);
  const maxNumber = Number(maxScore || 0);
  if (!maxNumber) return null;
  return Math.round((scoreNumber / maxNumber) * 100);
}

export function observedAccuracy(rows: Array<{ total_score?: unknown; max_score?: unknown }>) {
  const scored = rows
    .map((row) => percentage(row.total_score, row.max_score))
    .filter((value): value is number => value !== null);
  if (!scored.length) return null;
  return Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
}

export function learningState(input: {
  eventCount: number;
  practiceAttempts: number;
  assessmentCount: number;
  simulationCount: number;
  incorrectAnswers: number;
}) {
  if (!input.eventCount && !input.practiceAttempts && !input.assessmentCount && !input.simulationCount) {
    return "Sin evidencia suficiente";
  }
  if (input.incorrectAnswers >= 2) return "Requiere refuerzo según resultados";
  if (input.assessmentCount || input.simulationCount) return "Evaluado";
  if (input.practiceAttempts) return "Practicado";
  return "Estudiado";
}

export async function getStudentAnalytics(userId: string, filters: AnalyticsFilters = {}) {
  const since = periodStart(filters.period || "40d");
  const [units, events, progress, evidence, assessments, exams, classes, planActivities] = await Promise.all([
    safeRows("academic_units", (q) => q.select("id,unit_number,unit_name").order("unit_number").limit(50)),
    safeRows("student_learning_events", (q) => applyAcademicFilters(q.select("event_type,unit_id,topic_id,knowledge_object_id,created_at,metadata,academic_units(unit_number,unit_name),academic_topics(topic_number,topic_name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(2500), filters, since, "created_at")),
    safeRows("student_topic_progress", (q) => applyAcademicFilters(q.select("unit_id,topic_id,status,practice_attempts,correct_answers,incorrect_answers,last_studied_at,academic_units(unit_number,unit_name),academic_topics(topic_number,topic_name)").eq("user_id", userId).order("last_studied_at", { ascending: false }).limit(1000), filters, since, "last_studied_at")),
    safeRows("student_learning_evidence", (q) => q.select("evidence_type,result,score,max_score,created_at,knowledge_object_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000)),
    safeRows("assessment_sessions", (q) => applyAcademicFilters(q.select("id,status,unit_id,topic_id,total_score,max_score,total_questions,correct_answers,partial_answers,incorrect_answers,started_at,completed_at,created_at,academic_units(unit_number,unit_name),academic_topics(topic_number,topic_name)").eq("user_id", userId).order("created_at", { ascending: false }).limit(500), filters, since, "created_at")),
    safeRows("exam_sessions", (q) => applySince(q.select("id,status,total_score,max_score,total_questions,created_at,completed_at,configuration").eq("user_id", userId).order("created_at", { ascending: false }).limit(250), since, "created_at")),
    safeRows("guided_class_sessions", (q) => applyAcademicFilters(q.select("id,status,unit_id,topic_id,unit_number,topic_label,created_at,completed_at,updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(250), filters, since, "updated_at")),
    safeRows("student_study_activities", (q) => applyAcademicFilters(q.select("id,status,activity_type,unit_id,topic_id,title,scheduled_date,completed_at,estimated_minutes,actual_minutes").eq("user_id", userId).order("scheduled_date", { ascending: false }).limit(1000), filters, since, "scheduled_date")),
  ]);

  const unitLabels = buildUnitLabels(units);
  const coverage = buildCoverage(unitLabels, events, progress, assessments, classes);
  const assessmentRows = assessments.filter((row) => row.status === "completed");
  const examRows = exams.filter((row) => ["completed", "submitted"].includes(String(row.status)));
  const reinforcement = buildReinforcement(progress, assessments, evidence, unitLabels);
  const activitiesCompleted = planActivities.filter((row) => row.status === "completed").length;
  const activitiesPending = planActivities.filter((row) => ["pending", "in_progress", "postponed"].includes(String(row.status))).length;

  return {
    period: filters.period || "40d",
    since,
    activity: {
      events: events.length,
      daysWithActivity: uniqueDays(events.map((row) => row.created_at)),
      tutorInteractions: events.filter((row) => ["explanation_requested", "example_requested", "review_requested", "topic_studied", "topic_viewed"].includes(String(row.event_type))).length,
      classesStarted: classes.length,
      classesCompleted: classes.filter((row) => row.status === "completed").length,
    },
    coverage,
    assessments: {
      total: assessments.length,
      completed: assessmentRows.length,
      observedAccuracy: observedAccuracy(assessmentRows),
      recent: assessmentRows.slice(0, 10).map(assessmentSummary),
      trend: assessmentRows.slice().reverse().map(assessmentSummary),
    },
    simulations: {
      total: exams.length,
      completed: examRows.length,
      observedAccuracy: observedAccuracy(examRows),
      recent: examRows.slice(0, 10).map(examSummary),
      trend: examRows.slice().reverse().map(examSummary),
    },
    plan: {
      total: planActivities.length,
      completed: activitiesCompleted,
      pending: activitiesPending,
      completionPercent: planActivities.length ? Math.round((activitiesCompleted / planActivities.length) * 100) : null,
    },
    reinforcement,
    states: coverage.map((unit) => ({
      unitId: unit.unitId,
      unitLabel: unit.unitLabel,
      state: learningState({
        eventCount: unit.events,
        practiceAttempts: unit.practiceAttempts,
        assessmentCount: assessmentRows.filter((row) => row.unit_id === unit.unitId).length,
        simulationCount: examRows.length,
        incorrectAnswers: unit.incorrectAnswers,
      }),
    })),
    limitations: [
      "La actividad muestra uso registrado, no dominio académico definitivo.",
      "La cobertura indica contenidos trabajados; el rendimiento requiere evaluaciones o simulacros.",
      "Sin evaluaciones no se calcula tendencia de rendimiento.",
    ],
  };
}

export async function getAdminLearningAnalytics(filters: AnalyticsFilters = {}) {
  const since = periodStart(filters.period || "40d");
  const [students, units, events, progress, assessments, exams, classes, planActivities] = await Promise.all([
    safeRows("profiles", (q) => q.select("id,username,full_name,status").eq("role", "ESTUDIANTE").limit(1000)),
    safeRows("academic_units", (q) => q.select("id,unit_number,unit_name").order("unit_number").limit(50)),
    safeRows("student_learning_events", (q) => applyAcademicFilters(q.select("user_id,event_type,unit_id,topic_id,created_at,academic_units(unit_number,unit_name),academic_topics(topic_number,topic_name)").order("created_at", { ascending: false }).limit(5000), filters, since, "created_at")),
    safeRows("student_topic_progress", (q) => applyAcademicFilters(q.select("user_id,unit_id,topic_id,status,practice_attempts,incorrect_answers,last_studied_at,academic_units(unit_number,unit_name),academic_topics(topic_number,topic_name)").order("last_studied_at", { ascending: false }).limit(5000), filters, since, "last_studied_at")),
    safeRows("assessment_sessions", (q) => applyAcademicFilters(q.select("user_id,status,unit_id,topic_id,total_score,max_score,total_questions,incorrect_answers,created_at,academic_units(unit_number,unit_name),academic_topics(topic_number,topic_name)").order("created_at", { ascending: false }).limit(3000), filters, since, "created_at")),
    safeRows("exam_sessions", (q) => applySince(q.select("user_id,status,total_score,max_score,total_questions,created_at,completed_at,configuration").order("created_at", { ascending: false }).limit(1500), since, "created_at")),
    safeRows("guided_class_sessions", (q) => applyAcademicFilters(q.select("user_id,status,unit_id,topic_id,unit_number,topic_label,created_at,completed_at,updated_at").order("updated_at", { ascending: false }).limit(2000), filters, since, "updated_at")),
    safeRows("student_study_activities", (q) => applyAcademicFilters(q.select("user_id,status,activity_type,unit_id,topic_id,scheduled_date,completed_at").order("scheduled_date", { ascending: false }).limit(3000), filters, since, "scheduled_date")),
  ]);
  const unitLabels = buildUnitLabels(units);
  const activeStudentIds = new Set([...events, ...assessments, ...exams, ...classes, ...planActivities].map((row) => String(row.user_id || "")).filter(Boolean));
  const completedAssessments = assessments.filter((row) => row.status === "completed");
  const completedExams = exams.filter((row) => ["completed", "submitted"].includes(String(row.status)));
  return {
    period: filters.period || "40d",
    since,
    summary: {
      students: students.length,
      studentsWithActivity: activeStudentIds.size,
      events: events.length,
      assessmentsCompleted: completedAssessments.length,
      simulationsCompleted: completedExams.length,
      classesCompleted: classes.filter((row) => row.status === "completed").length,
      planActivitiesCompleted: planActivities.filter((row) => row.status === "completed").length,
      assessmentAccuracy: observedAccuracy(completedAssessments),
      simulationAccuracy: observedAccuracy(completedExams),
    },
    units: aggregateUnits(unitLabels, events, progress, completedAssessments, classes),
    activityTypes: aggregateBy(events, "event_type"),
    reinforcement: buildAdminReinforcement(progress, completedAssessments, unitLabels),
    assessmentTrend: completedAssessments.slice().reverse().map(assessmentSummary),
    simulationTrend: completedExams.slice().reverse().map(examSummary),
    limitations: [
      "Los indicadores agregados no incluyen conversaciones privadas.",
      "Las métricas agregadas no son ranking público de estudiantes.",
      "La precisión observada solo considera sesiones completadas con puntaje disponible.",
    ],
  };
}

export async function getStudentAnalyticsCsv(userId: string, filters: AnalyticsFilters = {}) {
  const analytics = await getStudentAnalytics(userId, filters);
  const rows = [
    ["dimension", "metric", "value"],
    ["activity", "events", analytics.activity.events],
    ["activity", "days_with_activity", analytics.activity.daysWithActivity],
    ["coverage", "worked_units", analytics.coverage.filter((unit) => unit.events || unit.practiceAttempts).length],
    ["assessments", "completed", analytics.assessments.completed],
    ["assessments", "observed_accuracy", analytics.assessments.observedAccuracy ?? "sin datos"],
    ["simulations", "completed", analytics.simulations.completed],
    ["plan", "completed", analytics.plan.completed],
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function buildUnitLabels(rows: Row[]) {
  const labels = new Map<string, UnitLabel>();
  for (const row of rows) {
    const id = String(row.id || "");
    if (!id) continue;
    labels.set(id, {
      id,
      unitNumber: Number(row.unit_number || 0),
      unitName: String(row.unit_name || "Unidad"),
    });
  }
  return labels;
}

function buildCoverage(unitLabels: Map<string, UnitLabel>, events: Row[], progress: Row[], assessments: Row[], classes: Row[]) {
  const ids = new Set([...unitLabels.keys(), ...events.map((row) => row.unit_id), ...progress.map((row) => row.unit_id), ...assessments.map((row) => row.unit_id), ...classes.map((row) => row.unit_id)].filter(Boolean).map(String));
  return [...ids].map((unitId) => {
    const unit = unitLabels.get(unitId);
    const unitEvents = events.filter((row) => row.unit_id === unitId);
    const unitProgress = progress.filter((row) => row.unit_id === unitId);
    const topicIds = new Set([...unitEvents, ...unitProgress].map((row) => String(row.topic_id || "")).filter(Boolean));
    return {
      unitId,
      unitNumber: unit?.unitNumber || 0,
      unitLabel: unit ? `${unit.unitNumber}. ${unit.unitName}` : "Unidad sin identificar",
      events: unitEvents.length,
      topicsWorked: topicIds.size,
      practiceAttempts: sum(unitProgress, "practice_attempts"),
      correctAnswers: sum(unitProgress, "correct_answers"),
      incorrectAnswers: sum(unitProgress, "incorrect_answers"),
      assessments: assessments.filter((row) => row.unit_id === unitId).length,
      classes: classes.filter((row) => row.unit_id === unitId).length,
      lastActivityAt: latest([...unitEvents.map((row) => row.created_at), ...unitProgress.map((row) => row.last_studied_at)]),
    };
  }).sort((a, b) => a.unitNumber - b.unitNumber);
}

function aggregateUnits(unitLabels: Map<string, UnitLabel>, events: Row[], progress: Row[], assessments: Row[], classes: Row[]) {
  return buildCoverage(unitLabels, events, progress, assessments, classes)
    .filter((unit) => unit.events || unit.practiceAttempts || unit.assessments || unit.classes)
    .sort((a, b) => b.events + b.practiceAttempts + b.assessments - (a.events + a.practiceAttempts + a.assessments))
    .slice(0, 15);
}

function buildReinforcement(progress: Row[], assessments: Row[], evidence: Row[], unitLabels: Map<string, UnitLabel>) {
  const rows = progress
    .filter((row) => Number(row.incorrect_answers || 0) > 0 || row.status === "review_needed")
    .map((row) => ({
      unitId: String(row.unit_id || ""),
      unitLabel: labelFor(unitLabels, row.unit_id),
      topicName: relatedName(row.academic_topics, "topic_name") || "Tema registrado",
      reason: Number(row.incorrect_answers || 0) > 1 ? "Errores repetidos" : "Revisión recomendada",
      incorrectAnswers: Number(row.incorrect_answers || 0),
      practiceAttempts: Number(row.practice_attempts || 0),
      lastActivityAt: row.last_studied_at as string | null,
    }));
  if (!rows.length && !assessments.length && !evidence.length) return [];
  return rows.slice(0, 8);
}

function buildAdminReinforcement(progress: Row[], assessments: Row[], unitLabels: Map<string, UnitLabel>) {
  const grouped = new Map<string, { unitId: string; unitLabel: string; incorrectAnswers: number; reviewRecords: number }>();
  for (const row of progress) {
    const unitId = String(row.unit_id || "unknown");
    const entry = grouped.get(unitId) || { unitId, unitLabel: labelFor(unitLabels, row.unit_id), incorrectAnswers: 0, reviewRecords: 0 };
    entry.incorrectAnswers += Number(row.incorrect_answers || 0);
    if (row.status === "review_needed") entry.reviewRecords += 1;
    grouped.set(unitId, entry);
  }
  for (const row of assessments) {
    const unitId = String(row.unit_id || "unknown");
    const entry = grouped.get(unitId) || { unitId, unitLabel: labelFor(unitLabels, row.unit_id), incorrectAnswers: 0, reviewRecords: 0 };
    entry.incorrectAnswers += Number(row.incorrect_answers || 0);
    grouped.set(unitId, entry);
  }
  return [...grouped.values()].filter((row) => row.incorrectAnswers || row.reviewRecords).sort((a, b) => b.incorrectAnswers + b.reviewRecords - (a.incorrectAnswers + a.reviewRecords)).slice(0, 10);
}

function aggregateBy(rows: Row[], key: string) {
  const grouped = new Map<string, number>();
  for (const row of rows) grouped.set(String(row[key] || "Sin clasificar"), (grouped.get(String(row[key] || "Sin clasificar")) || 0) + 1);
  return [...grouped.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

function assessmentSummary(row: Row) {
  return {
    id: row.id,
    date: row.completed_at || row.created_at || row.started_at,
    unitLabel: labelFromJoined(row) || "Unidad sin identificar",
    totalQuestions: Number(row.total_questions || 0),
    percent: percentage(row.total_score, row.max_score),
    correct: Number(row.correct_answers || 0),
    incorrect: Number(row.incorrect_answers || 0),
  };
}

function examSummary(row: Row) {
  return {
    id: row.id,
    date: row.completed_at || row.created_at,
    totalQuestions: Number(row.total_questions || 0),
    percent: percentage(row.total_score, row.max_score),
  };
}

function applyAcademicFilters<T extends QueryLike<RowsResult>>(query: T, filters: AnalyticsFilters, since: string | null, dateColumn: string): T {
  let next = applySince(query, since, dateColumn);
  if (filters.unitId) next = next.eq("unit_id", filters.unitId) as T;
  if (filters.topicId) next = next.eq("topic_id", filters.topicId) as T;
  return next;
}

function applySince<T extends QueryLike<RowsResult>>(query: T, since: string | null, dateColumn: string): T {
  return since ? (query.gte(dateColumn, since) as T) : query;
}

async function safeRows(table: string, build: (query: QueryLike<RowsResult>) => QueryLike<RowsResult>) {
  try {
    const query = createSupabaseAdmin().from(table) as unknown as QueryLike<RowsResult>;
    const { data, error } = await build(query);
    return error ? [] : data || [];
  } catch {
    return [];
  }
}

function sum(rows: Row[], key: string) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function uniqueDays(values: unknown[]) {
  return new Set(values.filter(Boolean).map((value) => String(value).slice(0, 10))).size;
}

function latest(values: unknown[]) {
  const dates = values.filter(Boolean).map(String).sort((a, b) => Date.parse(b) - Date.parse(a));
  return dates[0] || null;
}

function labelFor(unitLabels: Map<string, UnitLabel>, id: unknown) {
  const unit = unitLabels.get(String(id || ""));
  return unit ? `${unit.unitNumber}. ${unit.unitName}` : "Unidad sin identificar";
}

function labelFromJoined(row: Row) {
  return relatedName(row.academic_units, "unit_name");
}

function relatedName(value: unknown, field: string) {
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== "object") return null;
  return String((record as Row)[field] || "") || null;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

