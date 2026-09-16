import type { UsageEvent } from "@/lib/models";

export function summarizeUsage(events: UsageEvent[], studentIds: string[]) {
  const students = new Set(studentIds);
  const studentEvents = events.filter((event) => students.has(event.user_id));
  const knownCost = events.reduce(
    (sum, event) => sum + Number(event.estimated_cost ?? 0),
    0,
  );
  const missingCosts = events.filter(
    (event) => event.estimated_cost === null,
  ).length;
  const studentCost = studentEvents.reduce(
    (sum, event) => sum + Number(event.estimated_cost ?? 0),
    0,
  );
  return {
    tokens: events.reduce(
      (sum, event) =>
        sum + Number(event.input_tokens) + Number(event.output_tokens),
      0,
    ),
    audioSeconds: events.reduce(
      (sum, event) =>
        sum + Number(event.audio_input) + Number(event.audio_output),
      0,
    ),
    knownCost,
    missingCosts,
    averageCost:
      students.size && !studentEvents.some((e) => e.estimated_cost === null)
        ? studentCost / students.size
        : null,
  };
}
export function periodStart(period: string, now = new Date()) {
  // Ventanas móviles; las etiquetas del panel lo indican.
  const days = period === "day" ? 1 : period === "week" ? 7 : 30;
  return new Date(now.getTime() - days * 86400000).toISOString();
}
export const numberFormat = (n: number) =>
  new Intl.NumberFormat("es-BO").format(n);
export const moneyFormat = (n: number) =>
  new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
  }).format(n);
