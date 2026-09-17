import "server-only";
import type { AcademicIntent } from "@/lib/knowledge/types";

export type TutorMode = "normal" | "quick" | "explain" | "example" | "review";

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
  const needsTerra =
    input.complexity === "HIGH" ||
    input.mode === "explain" ||
    input.mode === "review" ||
    input.contextSize > 3000 ||
    complexIntent;
  return needsTerra ? terra : luna;
}
