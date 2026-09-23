import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getEconomicSettings } from "@/lib/billing/economic-settings";
import { estimateModelCost, pricingCatalogSummary } from "@/lib/ai/costs";

const pricingVersion = process.env.AI_PRICING_VERSION || "2026-09-config";
const usdToBob = Number(process.env.USD_TO_BOB_ACCOUNTING_RATE || "6.96");

export function calculateOperationCost(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  audioInputSeconds?: number;
  audioOutputSeconds?: number;
  outputCharacters?: number;
  embeddingTokens?: number;
}) {
  return estimateModelCost({
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cachedInputTokens: input.cachedInputTokens,
    audioInputSeconds: input.audioInputSeconds,
    audioOutputSeconds: input.audioOutputSeconds,
    outputCharacters: input.outputCharacters,
    embeddingTokens: input.embeddingTokens,
  });
}

export async function recordAIUsage(input: {
  userId: string;
  operationId: string;
  conversationId?: string | null;
  operationType:
    | "tutor_chat"
    | "embedding"
    | "evaluation"
    | "simulation"
    | "guided_class"
    | "guided_class_feedback"
    | "stt"
    | "tts"
    | "other";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  otherBillableUnits?: Record<string, unknown>;
  estimatedCostUsd?: number;
  costIsEstimated?: boolean;
}) {
  const settings = await getEconomicSettings();
  const audioInputSeconds = Number(input.otherBillableUnits?.audioInputSeconds || 0);
  const audioOutputSeconds = Number(input.otherBillableUnits?.audioOutputSeconds || 0);
  const outputCharacters = Number(input.otherBillableUnits?.outputCharacters || 0);
  const embeddingTokens = Number(input.otherBillableUnits?.embeddingTokens || 0);
  const estimatedCostUsd =
    input.estimatedCostUsd ??
    calculateOperationCost({
      model: input.model,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cachedInputTokens: input.cachedInputTokens,
      audioInputSeconds,
      audioOutputSeconds,
      outputCharacters,
      embeddingTokens,
    });
  const { error } = await createSupabaseAdmin()
    .from("ai_usage_events")
    .upsert(
      {
        user_id: input.userId,
        operation_id: input.operationId,
        conversation_id: input.conversationId || null,
        operation_type: input.operationType,
        model_used: input.model,
        input_tokens: input.inputTokens,
        output_tokens: input.outputTokens,
        cached_input_tokens: input.cachedInputTokens || 0,
        other_billable_units: input.otherBillableUnits || {},
        estimated_cost_usd: estimatedCostUsd,
        cost_is_estimated: input.costIsEstimated ?? true,
        pricing_version: pricingVersion,
        accounting_usd_to_bob: settings.usdToBobRate || usdToBob,
        estimated_cost_bob:
          estimatedCostUsd * (settings.usdToBobRate || usdToBob),
      },
      { onConflict: "operation_id" },
    );
  if (error) throw new Error("No se pudo registrar el consumo de IA.");
}

type UsageRow = {
  user_id: string;
  operation_type: string;
  model_used: string;
  input_tokens: number | string | null;
  output_tokens: number | string | null;
  cached_input_tokens: number | string | null;
  other_billable_units: Record<string, unknown> | null;
  estimated_cost_usd: number | string | null;
  estimated_cost_bob: number | string | null;
  cost_is_estimated: boolean | null;
  created_at: string;
};

type Bucket = {
  key: string;
  operations: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  costUsd: number;
  costBob: number;
  audioInputSeconds: number;
  audioOutputSeconds: number;
};

function emptyBucket(key: string): Bucket {
  return {
    key,
    operations: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    costUsd: 0,
    costBob: 0,
    audioInputSeconds: 0,
    audioOutputSeconds: 0,
  };
}

function addToBucket(bucket: Bucket, row: UsageRow) {
  const units = row.other_billable_units || {};
  bucket.operations += 1;
  bucket.inputTokens += Number(row.input_tokens || 0);
  bucket.outputTokens += Number(row.output_tokens || 0);
  bucket.cachedInputTokens += Number(row.cached_input_tokens || 0);
  bucket.costUsd += Number(row.estimated_cost_usd || 0);
  bucket.costBob += Number(row.estimated_cost_bob || 0);
  bucket.audioInputSeconds += Number(units.audioInputSeconds || units.audio_input_seconds || 0);
  bucket.audioOutputSeconds += Number(units.audioOutputSeconds || units.audio_output_seconds || 0);
}

function toArray(map: Map<string, Bucket>) {
  return [...map.values()].sort((a, b) => b.costBob - a.costBob);
}

function thresholdFor(percent: number, thresholds: number[]) {
  return [...thresholds].sort((a, b) => b - a).find((item) => percent >= item) || 0;
}

function daysBetween(start: Date, end: Date) {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
}

export async function getStudentUsageSummary(userId?: string) {
  const settings = await getEconomicSettings();
  const db = createSupabaseAdmin();
  let query = db
    .from("ai_usage_events")
    .select(
      "user_id,operation_type,model_used,input_tokens,output_tokens,cached_input_tokens,other_billable_units,estimated_cost_usd,estimated_cost_bob,cost_is_estimated,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(10000);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw new Error("No se pudo consultar el consumo de IA.");
  const rows = (data || []) as UsageRow[];
  const now = new Date();
  const periodStart = new Date(
    now.getTime() - settings.licenseDurationDays * 86_400_000,
  );
  const rowsInPeriod = rows.filter((row) => new Date(row.created_at) >= periodStart);
  const byUser = new Map<
    string,
    Bucket & {
      userId: string;
      models: Set<string>;
      operationTypes: Set<string>;
      firstSeenAt: Date | null;
      lastSeenAt: Date | null;
      estimatedRows: number;
      voiceCostBob: number;
    }
  >();
  const byOperation = new Map<string, Bucket>();
  const byModel = new Map<string, Bucket>();
  const byDay = new Map<string, Bucket>();

  for (const row of rowsInPeriod) {
    const createdAt = new Date(row.created_at);
    const current = byUser.get(row.user_id) || {
      ...emptyBucket(row.user_id),
      userId: row.user_id,
      models: new Set<string>(),
      operationTypes: new Set<string>(),
      firstSeenAt: null,
      lastSeenAt: null,
      estimatedRows: 0,
      voiceCostBob: 0,
    };
    addToBucket(current, row);
    current.models.add(row.model_used);
    current.operationTypes.add(row.operation_type);
    current.firstSeenAt = current.firstSeenAt
      ? createdAt < current.firstSeenAt
        ? createdAt
        : current.firstSeenAt
      : createdAt;
    current.lastSeenAt = current.lastSeenAt
      ? createdAt > current.lastSeenAt
        ? createdAt
        : current.lastSeenAt
      : createdAt;
    if (row.cost_is_estimated !== false) current.estimatedRows += 1;
    if (row.operation_type === "stt" || row.operation_type === "tts") {
      current.voiceCostBob += Number(row.estimated_cost_bob || 0);
    }
    byUser.set(row.user_id, current);

    const operationBucket = byOperation.get(row.operation_type) || emptyBucket(row.operation_type);
    addToBucket(operationBucket, row);
    byOperation.set(row.operation_type, operationBucket);

    const modelBucket = byModel.get(row.model_used) || emptyBucket(row.model_used);
    addToBucket(modelBucket, row);
    byModel.set(row.model_used, modelBucket);

    const dayKey = row.created_at.slice(0, 10);
    const dayBucket = byDay.get(dayKey) || emptyBucket(dayKey);
    addToBucket(dayBucket, row);
    byDay.set(dayKey, dayBucket);
  }

  const infrastructureShareBob =
    settings.expectedStudents > 0
      ? settings.infrastructureMonthlyBob / settings.expectedStudents
      : 0;

  const students = [...byUser.values()].map((item) => {
    const directCostBob = item.costBob;
    const totalTechnologyCostBob = directCostBob + infrastructureShareBob;
    const budgetPercent = settings.monthlyStudentBudgetBob
      ? Math.round((totalTechnologyCostBob / settings.monthlyStudentBudgetBob) * 100)
      : 0;
    const activeDays = item.firstSeenAt ? daysBetween(item.firstSeenAt, now) : 1;
    const dailyAverageBob = totalTechnologyCostBob / activeDays;
    const projectedPeriodBob = dailyAverageBob * settings.licenseDurationDays;
    return {
      ...item,
      models: [...item.models],
      operationTypes: [...item.operationTypes],
      budgetBob: settings.monthlyStudentBudgetBob,
      infrastructureShareBob,
      directCostBob,
      totalTechnologyCostBob,
      budgetPercent,
      threshold: thresholdFor(budgetPercent, settings.alertThresholds),
      dailyAverageBob,
      projectedPeriodBob,
      projectedBudgetPercent: settings.monthlyStudentBudgetBob
        ? Math.round((projectedPeriodBob / settings.monthlyStudentBudgetBob) * 100)
        : 0,
      voiceCostBob: item.voiceCostBob,
      firstSeenAt: item.firstSeenAt?.toISOString() || null,
      lastSeenAt: item.lastSeenAt?.toISOString() || null,
      costCompleteness:
        item.operations > 0
          ? Math.round(((item.operations - item.estimatedRows) / item.operations) * 100)
          : 0,
    };
  });

  const totalDirectCostBob = students.reduce((sum, item) => sum + item.directCostBob, 0);
  const totalTechnologyCostBob = students.reduce(
    (sum, item) => sum + item.totalTechnologyCostBob,
    0,
  );
  const observedDays = byDay.size || 1;
  const observedDailyCostBob = totalTechnologyCostBob / observedDays;
  const projectedPeriodCostBob = observedDailyCostBob * settings.licenseDurationDays;
  const projectedAllStudentsBob =
    students.length > 0
      ? (projectedPeriodCostBob / students.length) * settings.expectedStudents
      : 0;
  const voiceCostBob = toArray(byOperation)
    .filter((item) => item.key === "stt" || item.key === "tts")
    .reduce((sum, item) => sum + item.costBob, 0);
  const alerts = students
    .filter((item) => item.threshold > 0 || item.projectedBudgetPercent >= 100)
    .map((item) => ({
      userId: item.userId,
      threshold: item.threshold,
      currentPercent: item.budgetPercent,
      projectedPercent: item.projectedBudgetPercent,
      severity:
        item.budgetPercent >= 100 || item.projectedBudgetPercent >= 100
          ? ("critical" as const)
          : item.budgetPercent >= 75
            ? ("warning" as const)
            : ("notice" as const),
    }));

  const models = toArray(byModel);
  return {
    students: students.sort((a, b) => b.totalTechnologyCostBob - a.totalTechnologyCostBob),
    breakdown: {
      byOperation: toArray(byOperation),
      byModel: models,
      byDay: toArray(byDay).sort((a, b) => a.key.localeCompare(b.key)),
    },
    alerts,
    pricingCatalog: pricingCatalogSummary([
      ...new Set([
        ...models.map((item) => item.key),
        process.env.OPENAI_FAST_MODEL || "gpt-5.6-luna",
        process.env.OPENAI_MODEL || "gpt-5.6-terra",
        process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe",
        process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
      ]),
    ]),
    totals: {
      students: students.length,
      operations: students.reduce((sum, item) => sum + item.operations, 0),
      inputTokens: students.reduce((sum, item) => sum + item.inputTokens, 0),
      outputTokens: students.reduce((sum, item) => sum + item.outputTokens, 0),
      cachedInputTokens: students.reduce((sum, item) => sum + item.cachedInputTokens, 0),
      costUsd: students.reduce((sum, item) => sum + item.costUsd, 0),
      costBob: totalTechnologyCostBob,
      directCostBob: totalDirectCostBob,
      sharedInfrastructureBob: students.length * infrastructureShareBob,
      voiceCostBob,
      averageCostBob: students.length ? totalTechnologyCostBob / students.length : 0,
      observedDays,
      observedDailyCostBob,
      projectedPeriodCostBob,
      projectedAllStudentsBob,
      aggregateBudgetBob: settings.expectedStudents * settings.monthlyStudentBudgetBob,
      budgetBob: settings.monthlyStudentBudgetBob,
      expectedStudents: settings.expectedStudents,
      projectedMonthlyBudgetBob:
        settings.expectedStudents * settings.monthlyStudentBudgetBob,
      infrastructureMonthlyBob: settings.infrastructureMonthlyBob,
      licenseDurationDays: settings.licenseDurationDays,
      voiceMonthlyBudgetBob: settings.voiceMonthlyBudgetBob,
      voiceEnabled: settings.voiceEnabled,
      alertThresholds: settings.alertThresholds,
      usdToBob: settings.usdToBobRate || usdToBob,
      pricingVersion,
    },
  };
}

export async function getStudentDailyCost(userId: string) {
  return getCostSince(userId, new Date(Date.now() - 24 * 60 * 60 * 1000));
}

export async function getStudentMonthlyCost(userId: string) {
  const settings = await getEconomicSettings();
  return getCostSince(
    userId,
    new Date(Date.now() - settings.licenseDurationDays * 24 * 60 * 60 * 1000),
  );
}

export async function getStudentPeriodCost(userId: string) {
  const settings = await getEconomicSettings();
  return getCostSince(
    userId,
    new Date(Date.now() - settings.licenseDurationDays * 24 * 60 * 60 * 1000),
  );
}

async function getCostSince(userId: string, since: Date) {
  const { data } = await createSupabaseAdmin()
    .from("ai_usage_events")
    .select("estimated_cost_usd,estimated_cost_bob")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());
  return (data || []).reduce(
    (acc, row) => ({
      usd: acc.usd + Number(row.estimated_cost_usd || 0),
      bob: acc.bob + Number(row.estimated_cost_bob || 0),
    }),
    { usd: 0, bob: 0 },
  );
}
