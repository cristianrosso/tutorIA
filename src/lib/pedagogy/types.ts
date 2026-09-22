import type {
  AcademicIntent,
  KnowledgeChunkCandidate,
} from "@/lib/knowledge/types";

export const pedagogicalModes = [
  "normal",
  "quick",
  "explain",
  "simple",
  "academic",
  "deep",
  "example",
  "review",
  "comparison",
  "step_by_step",
] as const;

export type TutorMode = (typeof pedagogicalModes)[number];

export const selectablePedagogicalModes = [
  "quick",
  "simple",
  "academic",
  "deep",
  "example",
  "review",
  "comparison",
  "step_by_step",
] as const;

export type SelectablePedagogicalMode =
  (typeof selectablePedagogicalModes)[number];

export const pedagogicalStrategies = [
  "DIRECT_EXPLANATION",
  "PROGRESSIVE_EXPLANATION",
  "CONCEPTUAL_BREAKDOWN",
  "PRACTICAL_EXAMPLE",
  "COMPARATIVE_EXPLANATION",
  "PROCEDURAL_EXPLANATION",
  "ACTIVE_RECALL",
  "GUIDED_REVIEW",
] as const;

export type PedagogicalStrategy = (typeof pedagogicalStrategies)[number];

export type ModeDetectionResult = {
  mode: TutorMode;
  confidence: number;
  reason: string;
  reformulationRequested: boolean;
  explicitPreference: boolean;
};

export type PedagogicalPreference = {
  preferredMode: TutorMode | null;
  metadata?: Record<string, unknown>;
};

export type StrategyInput = {
  query: string;
  mode: TutorMode;
  queryIntent: AcademicIntent;
  academicMemory?: string;
  availableSources: KnowledgeChunkCandidate[];
  reformulationRequested?: boolean;
};

export type PedagogicalPromptInput = StrategyInput & {
  context: string;
  history: string;
  memoryContext: string;
  adaptiveContext: string;
  studyPlanContext: string;
  strategy: PedagogicalStrategy;
};

export function isTutorMode(value: unknown): value is TutorMode {
  return (
    typeof value === "string" && pedagogicalModes.includes(value as TutorMode)
  );
}

export function canonicalTutorMode(
  mode: TutorMode | null | undefined,
): TutorMode {
  if (!mode || mode === "normal") return "normal";
  if (mode === "explain") return "simple";
  return mode;
}
