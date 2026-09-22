import type {
  LearningGap,
  LearningGapType,
  MasteryEstimate,
  NormalizedEvidence,
} from "@/lib/adaptive/types";
import { estimateMasteryFromEvidence } from "@/lib/adaptive/mastery-estimator";

export function classifyGapFromEvidence(
  evidence: NormalizedEvidence[],
): LearningGap {
  const estimate = estimateMasteryFromEvidence(evidence);
  const problemCount = estimate.incorrectAnswers + estimate.partialAnswers;
  const recent = [...evidence]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 3);
  const recentProblems = recent.filter(
    (item) => item.result === "incorrect" || item.result === "partial",
  ).length;
  const gapType = chooseGapType(estimate, problemCount, recentProblems);
  return {
    knowledgeObjectId: estimate.knowledgeObjectId,
    topicId: estimate.topicId,
    unitId: estimate.unitId,
    gapType,
    severity: severityFor(gapType, estimate),
    reason: reasonFor(gapType, estimate),
    estimate,
  };
}

export function identifyGapsFromGroupedEvidence(
  groups: NormalizedEvidence[][],
) {
  return groups
    .map(classifyGapFromEvidence)
    .sort((a, b) => b.severity - a.severity);
}

function chooseGapType(
  estimate: MasteryEstimate,
  problemCount: number,
  recentProblems: number,
): LearningGapType {
  if (estimate.evidenceCount < 2) return "EVIDENCE_INSUFFICIENT";
  if (problemCount === 1) return "ISOLATED_ERROR";
  if (problemCount >= 3 || recentProblems >= 2 || estimate.masteryScore < 45)
    return "RECURRENT_DIFFICULTY";
  if (problemCount >= 2 || estimate.masteryScore < 70)
    return "OBSERVED_DIFFICULTY";
  return "NO_GAP";
}

function severityFor(type: LearningGapType, estimate: MasteryEstimate) {
  if (type === "RECURRENT_DIFFICULTY")
    return Math.round(90 - estimate.masteryScore / 5);
  if (type === "OBSERVED_DIFFICULTY")
    return Math.round(68 - estimate.masteryScore / 8);
  if (type === "ISOLATED_ERROR") return 35;
  if (type === "EVIDENCE_INSUFFICIENT") return 28;
  return 0;
}

function reasonFor(type: LearningGapType, estimate: MasteryEstimate) {
  if (type === "EVIDENCE_INSUFFICIENT")
    return "Aún falta evidencia evaluativa para estimar dominio con seguridad.";
  if (type === "ISOLATED_ERROR")
    return "Hay un error aislado; conviene practicar una pregunta más antes de marcar dificultad.";
  if (type === "OBSERVED_DIFFICULTY")
    return "La evidencia muestra dificultad en este tema y requiere práctica dirigida.";
  if (type === "RECURRENT_DIFFICULTY")
    return "La dificultad se repite en varias respuestas recientes; conviene repasar el concepto base y luego practicar.";
  return `Dominio observado ${estimate.masteryScore}%.`;
}
