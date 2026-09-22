import "server-only";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const pricingVersion = process.env.AI_PRICING_VERSION || "2026-09-config";
const usdToBob = Number(process.env.USD_TO_BOB_ACCOUNTING_RATE || "6.96");
const studentPeriodPriceBob = Number(process.env.STUDENT_PERIOD_PRICE_BOB || "200");
const studentPeriodBudgetBob = Number(process.env.STUDENT_PERIOD_BUDGET_BOB || "80");

const modelPrices: Record<string, { input: number; output: number; cachedInput?: number }> = {
  "gpt-5.6-luna": {
    input: Number(process.env.OPENAI_LUNA_INPUT_COST_PER_1M || process.env.OPENAI_TEXT_INPUT_COST_PER_1M || "0.4"),
    output: Number(process.env.OPENAI_LUNA_OUTPUT_COST_PER_1M || process.env.OPENAI_TEXT_OUTPUT_COST_PER_1M || "1.6"),
  },
  "gpt-5.6-terra": {
    input: Number(process.env.OPENAI_TERRA_INPUT_COST_PER_1M || process.env.OPENAI_TEXT_INPUT_COST_PER_1M || "2"),
    output: Number(process.env.OPENAI_TERRA_OUTPUT_COST_PER_1M || process.env.OPENAI_TEXT_OUTPUT_COST_PER_1M || "12"),
  },
};

export function calculateOperationCost(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
}) {
  const prices = modelPrices[input.model] || {
    input: Number(process.env.OPENAI_TEXT_INPUT_COST_PER_1M || "0.4"),
    output: Number(process.env.OPENAI_TEXT_OUTPUT_COST_PER_1M || "1.6"),
    cachedInput: Number(process.env.OPENAI_CACHED_INPUT_COST_PER_1M || "0"),
  };
  const cached = input.cachedInputTokens || 0;
  const regularInput = Math.max(0, input.inputTokens - cached);
  return (
    (regularInput / 1_000_000) * prices.input +
    (cached / 1_000_000) * (prices.cachedInput || prices.input) +
    (input.outputTokens / 1_000_000) * prices.output
  );
}

export async function recordAIUsage(input: {
  userId: string;
  operationId: string;
  conversationId?: string | null;
  operationType: "tutor_chat" | "embedding" | "evaluation" | "simulation" | "stt" | "tts" | "other";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  otherBillableUnits?: Record<string, unknown>;
  estimatedCostUsd?: number;
  costIsEstimated?: boolean;
}) {
  const estimatedCostUsd = input.estimatedCostUsd ?? calculateOperationCost({
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cachedInputTokens: input.cachedInputTokens,
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
        accounting_usd_to_bob: usdToBob,
        estimated_cost_bob: estimatedCostUsd * usdToBob,
      },
      { onConflict: "operation_id" },
    );
  if (error) throw new Error("No se pudo registrar el consumo de IA.");
}

export async function getStudentUsageSummary(userId?: string) {
  const db = createSupabaseAdmin();
  let query = db
    .from("ai_usage_events")
    .select("user_id,operation_type,model_used,input_tokens,output_tokens,cached_input_tokens,estimated_cost_usd,estimated_cost_bob,created_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw new Error("No se pudo consultar el consumo de IA.");
  const rows = data || [];
  const byUser = new Map<string, { userId: string; operations: number; inputTokens: number; outputTokens: number; costUsd: number; costBob: number; models: Set<string> }>();
  for (const row of rows) {
    const current = byUser.get(row.user_id) || {
      userId: row.user_id,
      operations: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      costBob: 0,
      models: new Set<string>(),
    };
    current.operations += 1;
    current.inputTokens += Number(row.input_tokens || 0);
    current.outputTokens += Number(row.output_tokens || 0);
    current.costUsd += Number(row.estimated_cost_usd || 0);
    current.costBob += Number(row.estimated_cost_bob || 0);
    if (row.model_used) current.models.add(row.model_used);
    byUser.set(row.user_id, current);
  }
  const students = [...byUser.values()].map((item) => ({
    ...item,
    models: [...item.models],
    budgetBob: studentPeriodBudgetBob,
    priceBob: studentPeriodPriceBob,
    budgetPercent: studentPeriodBudgetBob ? Math.round((item.costBob / studentPeriodBudgetBob) * 100) : 0,
  }));
  const totalCostBob = students.reduce((sum, item) => sum + item.costBob, 0);
  return {
    students,
    totals: {
      students: students.length,
      operations: students.reduce((sum, item) => sum + item.operations, 0),
      inputTokens: students.reduce((sum, item) => sum + item.inputTokens, 0),
      outputTokens: students.reduce((sum, item) => sum + item.outputTokens, 0),
      costUsd: students.reduce((sum, item) => sum + item.costUsd, 0),
      costBob: totalCostBob,
      averageCostBob: students.length ? totalCostBob / students.length : 0,
      budgetBob: studentPeriodBudgetBob,
      priceBob: studentPeriodPriceBob,
      usdToBob,
      pricingVersion,
    },
  };
}

export async function getStudentDailyCost(userId: string) {
  return getCostSince(userId, new Date(Date.now() - 24 * 60 * 60 * 1000));
}

export async function getStudentMonthlyCost(userId: string) {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return getCostSince(userId, date);
}

export async function getStudentPeriodCost(userId: string) {
  return getCostSince(userId, new Date(`${new Date().getFullYear()}-10-01T00:00:00-04:00`));
}

async function getCostSince(userId: string, since: Date) {
  const { data } = await createSupabaseAdmin()
    .from("ai_usage_events")
    .select("estimated_cost_usd,estimated_cost_bob")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());
  return (data || []).reduce(
    (acc, row) => ({ usd: acc.usd + Number(row.estimated_cost_usd || 0), bob: acc.bob + Number(row.estimated_cost_bob || 0) }),
    { usd: 0, bob: 0 },
  );
}
