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
  const luna = process.env.OPENAI_FAST_MODEL || "gpt-5.6-luna";
  const terra = process.env.OPENAI_MODEL || "gpt-5.6-terra";
  const complexIntent = ["comparison", "procedure", "explanation"].includes(
    input.intent,
  );
  const richerMode = [
    "explain",
    "simple",
    "academic",
    "deep",
    "review",
    "comparison",
    "step_by_step",
  ].includes(input.mode);
  const needsTerra =
    input.complexity === "HIGH" ||
    richerMode ||
    input.contextSize > 3000 ||
    complexIntent;
  return needsTerra ? terra : luna;
}
