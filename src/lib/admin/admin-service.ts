import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { accessProblem } from "@/lib/auth/rules";
import type { Profile } from "@/lib/models";
import { getEconomicSettings } from "@/lib/billing/economic-settings";

const PAGE_SIZE = 25;

type CountResult = { count: number | null; error: { message?: string } | null };
type RowsResult = {
  data: unknown[] | null;
  error: { message?: string } | null;
};
type QueryLike<T> = PromiseLike<T> & {
  select: (...args: unknown[]) => QueryLike<T>;
  eq: (...args: unknown[]) => QueryLike<T>;
  gte: (...args: unknown[]) => QueryLike<T>;
  is: (...args: unknown[]) => QueryLike<T>;
  in: (...args: unknown[]) => QueryLike<T>;
  order: (...args: unknown[]) => QueryLike<T>;
  limit: (...args: unknown[]) => QueryLike<T>;
};

type LicenseRow = {
  id: string;
  user_id: string;
  status: string;
  activated_at: string;
  expires_at: string;
  duration_days: number;
  source?: string | null;
  activated_by?: string | null;
  created_at: string;
};

type AuditRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export function licenseStatus(
  profile: Pick<Profile, "status" | "starts_at" | "expires_at">,
  now = new Date(),
) {
  if (profile.status !== "active") return "suspended";
  const starts = Date.parse(profile.starts_at);
  const expires = profile.expires_at ? Date.parse(profile.expires_at) : null;
  if (Number.isFinite(starts) && starts > now.getTime()) return "pending";
  if (expires !== null && Number.isFinite(expires) && expires <= now.getTime())
    return "expired";
  return "active";
}

export async function logAdminAction(input: {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await createSupabaseAdmin()
      .from("admin_audit_logs")
      .insert({
        actor_user_id: input.actorId,
        action: input.action,
        resource_type: input.resourceType,
        resource_id: input.resourceId || null,
        metadata: input.metadata || {},
      });
  } catch {
    // La auditoría queda disponible cuando se aplique la migración Sprint 17.
  }
}

async function safeCount(
  table: string,
  column = "id",
  filter?: (query: QueryLike<CountResult>) => QueryLike<CountResult>,
) {
  try {
    let query = createSupabaseAdmin()
      .from(table)
      .select(column, {
        count: "exact",
        head: true,
      }) as unknown as QueryLike<CountResult>;
    if (filter) query = filter(query);
    const result = await query;
    return result.error ? 0 : result.count || 0;
  } catch {
    return 0;
  }
}

async function getProfiles() {
  const { data, error } = await createSupabaseAdmin()
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error("No se pudieron consultar los usuarios.");
  return (data || []) as Profile[];
}

export async function getAdminDashboardSummary() {
  const [profiles, settings] = await Promise.all([
    getProfiles(),
    getEconomicSettings(),
  ]);
  const students = profiles.filter((profile) => profile.role === "ESTUDIANTE");
  const now = Date.now();
  const activeStudents = students.filter(
    (profile) => !accessProblem(profile),
  ).length;
  const pending = students.filter(
    (profile) => licenseStatus(profile) === "pending",
  ).length;
  const expired = students.filter(
    (profile) => licenseStatus(profile) === "expired",
  ).length;
  const today = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const month = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [
    activeToday,
    activeMonth,
    tutorMessages,
    assessments,
    exams,
    aiUsage,
    alerts,
  ] = await Promise.all([
    safeCount("tutor_messages", "user_id", (q) =>
      q.gte("created_at", today).eq("role", "user"),
    ),
    safeCount("tutor_messages", "user_id", (q) =>
      q.gte("created_at", month).eq("role", "user"),
    ),
    safeCount("tutor_messages", "id", (q) =>
      q.gte("created_at", month).eq("role", "user"),
    ),
    safeCount("assessment_sessions", "id", (q) => q.gte("created_at", month)),
    safeCount("exam_sessions", "id", (q) =>
      q.gte("created_at", month).in("status", ["completed", "submitted"]),
    ),
    getAiUsageTotals(),
    safeCount("usage_alerts", "id", (q) => q.is("resolved_at", null)),
  ]);
  return {
    users: profiles.length,
    students: students.length,
    activeStudents,
    pendingLicenses: pending,
    expiredLicenses: expired,
    activeToday,
    activeMonth,
    tutorMessages,
    assessments,
    exams,
    aiUsage,
    alerts,
    expectedStudents: settings.expectedStudents,
    budgetBob: settings.monthlyStudentBudgetBob,
    projectedBudgetBob:
      settings.expectedStudents * settings.monthlyStudentBudgetBob,
    referenceTime: now,
  };
}

async function getAiUsageTotals() {
  try {
    const { data, error } = await createSupabaseAdmin()
      .from("ai_usage_events")
      .select(
        "operation_type,input_tokens,output_tokens,estimated_cost_usd,estimated_cost_bob,other_billable_units",
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (error)
      return {
        operations: 0,
        tokens: 0,
        costUsd: 0,
        costBob: 0,
        audioInputSeconds: 0,
        audioOutputSeconds: 0,
        byType: {} as Record<string, number>,
      };
    const byType: Record<string, number> = {};
    let audioInputSeconds = 0;
    let audioOutputSeconds = 0;
    let tokens = 0;
    let costUsd = 0;
    let costBob = 0;
    for (const row of data || []) {
      const type = String(row.operation_type || "other");
      byType[type] = (byType[type] || 0) + 1;
      tokens += Number(row.input_tokens || 0) + Number(row.output_tokens || 0);
      costUsd += Number(row.estimated_cost_usd || 0);
      costBob += Number(row.estimated_cost_bob || 0);
      const units = (row.other_billable_units || {}) as Record<string, unknown>;
      audioInputSeconds += Number(units.audioInputSeconds || 0);
      audioOutputSeconds += Number(units.audioOutputSeconds || 0);
    }
    return {
      operations: data?.length || 0,
      tokens,
      costUsd,
      costBob,
      audioInputSeconds,
      audioOutputSeconds,
      byType,
    };
  } catch {
    return {
      operations: 0,
      tokens: 0,
      costUsd: 0,
      costBob: 0,
      audioInputSeconds: 0,
      audioOutputSeconds: 0,
      byType: {} as Record<string, number>,
    };
  }
}

export async function getAdminStudents(
  input: { query?: string; status?: string; page?: number } = {},
) {
  const page = Math.max(1, Number(input.page || 1));
  let query = createSupabaseAdmin()
    .from("profiles")
    .select("*", { count: "exact" })
    .eq("role", "ESTUDIANTE")
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const search = input.query?.trim();
  if (search)
    query = query.or(`username.ilike.%${search}%,full_name.ilike.%${search}%`);
  const { data, error, count } = await query;
  if (error) throw new Error("No se pudo consultar estudiantes.");
  let rows = ((data || []) as Profile[]).map((profile) => ({
    ...profile,
    licenseStatus: licenseStatus(profile),
  }));
  if (input.status && input.status !== "all")
    rows = rows.filter((profile) => profile.licenseStatus === input.status);
  return {
    students: rows,
    total: count || rows.length,
    page,
    pageSize: PAGE_SIZE,
  };
}

export async function getAdminStudentDetail(id: string) {
  const db = createSupabaseAdmin();
  const { data: profile, error } = await db
    .from("profiles")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !profile) throw new Error("No se encontró el estudiante.");
  const [licenses, learningEvents, topicProgress, assessments, exams, usage] =
    await Promise.all([
      getStudentLicenses(id),
      safeRows("student_learning_events", (q) =>
        q
          .select("event_type,created_at,unit_id,topic_id,metadata")
          .eq("user_id", id)
          .order("created_at", { ascending: false })
          .limit(10),
      ),
      safeRows("student_topic_progress", (q) =>
        q
          .select(
            "status,practice_attempts,incorrect_answers,last_studied_at,unit_id,topic_id",
          )
          .eq("user_id", id)
          .order("last_studied_at", { ascending: false })
          .limit(10),
      ),
      safeRows("assessment_sessions", (q) =>
        q
          .select(
            "status,total_score,max_score,started_at,completed_at,total_questions",
          )
          .eq("user_id", id)
          .order("created_at", { ascending: false })
          .limit(5),
      ),
      safeRows("exam_sessions", (q) =>
        q
          .select(
            "status,total_score,max_score,created_at,completed_at,total_questions",
          )
          .eq("user_id", id)
          .order("created_at", { ascending: false })
          .limit(5),
      ),
      getStudentUsageBrief(id),
    ]);
  return {
    profile: profile as Profile,
    licenseStatus: licenseStatus(profile as Profile),
    licenses,
    learningEvents,
    topicProgress,
    assessments,
    exams,
    usage,
  };
}

async function safeRows(
  table: string,
  build: (query: QueryLike<RowsResult>) => QueryLike<RowsResult>,
) {
  try {
    const query = createSupabaseAdmin().from(
      table,
    ) as unknown as QueryLike<RowsResult>;
    const { data, error } = await build(query);
    return error ? [] : data || [];
  } catch {
    return [];
  }
}

async function getStudentLicenses(userId: string) {
  return (await safeRows("student_licenses", (q) =>
    q
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  )) as LicenseRow[];
}

async function getStudentUsageBrief(userId: string) {
  try {
    const { data } = await createSupabaseAdmin()
      .from("ai_usage_events")
      .select(
        "operation_type,input_tokens,output_tokens,estimated_cost_bob,estimated_cost_usd",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000);
    return (data || []).reduce(
      (acc, row) => ({
        operations: acc.operations + 1,
        tokens:
          acc.tokens +
          Number(row.input_tokens || 0) +
          Number(row.output_tokens || 0),
        costBob: acc.costBob + Number(row.estimated_cost_bob || 0),
        costUsd: acc.costUsd + Number(row.estimated_cost_usd || 0),
      }),
      { operations: 0, tokens: 0, costBob: 0, costUsd: 0 },
    );
  } catch {
    return { operations: 0, tokens: 0, costBob: 0, costUsd: 0 };
  }
}

export async function getAdminLicenses() {
  const profiles = (await getProfiles()).filter(
    (profile) => profile.role === "ESTUDIANTE",
  );
  const rows = profiles.map((profile) => ({
    id: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    status: profile.status,
    startsAt: profile.starts_at,
    expiresAt: profile.expires_at,
    licenseStatus: licenseStatus(profile),
  }));
  return {
    rows,
    counts: {
      active: rows.filter((row) => row.licenseStatus === "active").length,
      pending: rows.filter((row) => row.licenseStatus === "pending").length,
      expired: rows.filter((row) => row.licenseStatus === "expired").length,
      suspended: rows.filter((row) => row.licenseStatus === "suspended").length,
    },
  };
}

export async function getAdminAcademics() {
  const [events, progress, assessments, exams, units] = await Promise.all([
    safeRows("student_learning_events", (q) =>
      q
        .select("event_type,unit_id,topic_id,created_at")
        .order("created_at", { ascending: false })
        .limit(3000),
    ),
    safeRows("student_topic_progress", (q) =>
      q
        .select(
          "status,unit_id,topic_id,incorrect_answers,practice_attempts,last_studied_at",
        )
        .limit(3000),
    ),
    safeRows("assessment_sessions", (q) =>
      q
        .select("status,total_score,max_score,total_questions,created_at")
        .limit(2000),
    ),
    safeRows("exam_sessions", (q) =>
      q
        .select("status,total_score,max_score,total_questions,created_at")
        .limit(1000),
    ),
    safeRows("academic_units", (q) =>
      q.select("id,unit_number,unit_name").order("unit_number"),
    ),
  ]);
  const unitNames = new Map(
    (
      units as Array<{ id: string; unit_number: number; unit_name: string }>
    ).map((unit) => [unit.id, `${unit.unit_number}. ${unit.unit_name}`]),
  );
  const byUnit = new Map<string, number>();
  for (const item of [...events, ...progress] as Array<{
    unit_id?: string | null;
  }>) {
    if (!item.unit_id) continue;
    byUnit.set(item.unit_id, (byUnit.get(item.unit_id) || 0) + 1);
  }
  const reinforcement = (
    progress as Array<{
      incorrect_answers?: number;
      practice_attempts?: number;
      unit_id?: string | null;
    }>
  )
    .filter((row) => Number(row.incorrect_answers || 0) > 0)
    .slice(0, 10);
  return {
    events: events.length,
    progressRecords: progress.length,
    assessments: assessments.length,
    exams: exams.length,
    units: [...byUnit.entries()]
      .map(([id, count]) => ({ name: unitNames.get(id) || "Unidad", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    reinforcement,
  };
}

export async function getAdminSystemStatus() {
  const checks = await Promise.all([
    tableCheck("profiles"),
    tableCheck("academic_units"),
    tableCheck("knowledge_objects"),
    tableCheck("ai_usage_events"),
    tableCheck("student_licenses"),
    tableCheck("admin_audit_logs"),
  ]);
  const [recentUsage, failedExams, failedClasses] = await Promise.all([
    safeRows("ai_usage_events", (q) =>
      q
        .select("operation_type,model_used,created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ),
    safeRows("exam_sessions", (q) =>
      q
        .select("id,status,created_at")
        .in("status", ["grading_failed", "expired"])
        .order("created_at", { ascending: false })
        .limit(8),
    ),
    safeRows("guided_class_sessions", (q) =>
      q
        .select("id,status,created_at")
        .eq("status", "error")
        .order("created_at", { ascending: false })
        .limit(8),
    ),
  ]);
  return { checks, recentUsage, failedExams, failedClasses };
}

async function tableCheck(table: string) {
  try {
    const { error } = await createSupabaseAdmin()
      .from(table)
      .select("id")
      .limit(1);
    return { name: table, ok: !error, detail: error?.message || "Disponible" };
  } catch (error) {
    return {
      name: table,
      ok: false,
      detail: error instanceof Error ? error.message : "No disponible",
    };
  }
}

export async function getAdminAuditLogs() {
  return (await safeRows("admin_audit_logs", (q) =>
    q.select("*").order("created_at", { ascending: false }).limit(100),
  )) as AuditRow[];
}

export async function createLicenseRecord(input: {
  userId: string;
  actorId: string;
  activatedAt: string;
  expiresAt: string;
  durationDays: number;
  source?: string;
  notes?: string;
}) {
  try {
    await createSupabaseAdmin()
      .from("student_licenses")
      .insert({
        user_id: input.userId,
        status: "active",
        activated_at: input.activatedAt,
        expires_at: input.expiresAt,
        duration_days: input.durationDays,
        source: input.source || "admin_panel",
        activated_by: input.actorId,
        notes: input.notes || null,
      });
  } catch {
    // La tabla de licencias queda disponible al aplicar Sprint 17.
  }
}
