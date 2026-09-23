import { NextResponse } from "next/server";
import { z } from "zod";
import type { AnalyticsFilters, AnalyticsPeriod } from "@/lib/analytics/learning-analytics";

const periodSchema = z.enum(["7d", "30d", "40d", "all"]).default("40d");
const nullableUuidSchema = z
  .string()
  .trim()
  .uuid()
  .optional()
  .nullable();

export const analyticsQuerySchema = z.object({
  period: periodSchema,
  unitId: nullableUuidSchema,
  topicId: nullableUuidSchema,
});

export function parseAnalyticsFilters(searchParams: URLSearchParams): AnalyticsFilters {
  const parsed = analyticsQuerySchema.safeParse({
    period: searchParams.get("period") || "40d",
    unitId: searchParams.get("unitId") || null,
    topicId: searchParams.get("topicId") || null,
  });
  if (!parsed.success) throw new SecurityInputError("Parámetros inválidos.");
  return {
    period: parsed.data.period as AnalyticsPeriod,
    unitId: parsed.data.unitId || null,
    topicId: parsed.data.topicId || null,
  };
}

export class SecurityInputError extends Error {
  constructor(message = "Solicitud inválida.") {
    super(message);
    this.name = "SecurityInputError";
  }
}

export function secureJsonError(error: unknown) {
  if (error instanceof SecurityInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(
    { error: "No se pudo completar la solicitud." },
    { status: 500 },
  );
}

export function isSafePeriod(value: string | null): value is AnalyticsPeriod {
  return periodSchema.safeParse(value || "40d").success;
}
