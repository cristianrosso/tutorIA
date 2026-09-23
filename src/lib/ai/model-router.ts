import "server-only";
import type { AcademicIntent } from "@/lib/knowledge/types";
import type { TutorMode } from "@/lib/pedagogy/types";

export type { TutorMode } from "@/lib/pedagogy/types";

export function selectModel(input: {
  intent: AcademicIntent;
  complexity: "LOW" | "MEDIUM" | "HIGH";
  mode: TutorMode;
  contextSize: number;
}) {
  const economy =
    process.env.OPENAI_ECONOMY_MODEL ||
    process.env.OPENAI_FAST_MODEL ||
    "gpt-5.6-luna";
  const balanced = process.env.OPENAI_MODEL || "gpt-5.6-terra";
  const heavyMode = ["deep", "comparison", "step_by_step"].includes(input.mode);
  const heavyIntent = ["comparison", "procedure"].includes(input.intent);
  const needsTerra =
    input.complexity === "HIGH" ||
    input.contextSize > 4200 ||
    heavyMode ||
    (heavyIntent && input.complexity !== "LOW");
  return needsTerra ? balanced : economy;
}
