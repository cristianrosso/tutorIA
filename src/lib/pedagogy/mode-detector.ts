import type {
  ModeDetectionResult,
  PedagogicalPreference,
  TutorMode,
} from "@/lib/pedagogy/types";
import { canonicalTutorMode } from "@/lib/pedagogy/types";

const patterns: Array<{
  mode: TutorMode;
  reason: string;
  regex: RegExp;
  confidence: number;
}> = [
  {
    mode: "quick",
    reason: "solicitud breve o resumen rapido",
    regex:
      /\b(r[aá]pido|breve|res[uú]melo|en pocas palabras|directo|concreto)\b/i,
    confidence: 0.86,
  },
  {
    mode: "example",
    reason: "solicitud de ejemplo pedagogico",
    regex:
      /\b(ejemplo|caso pr[aá]ctico|situaci[oó]n|otro ejemplo|aplicado a)\b/i,
    confidence: 0.92,
  },
  {
    mode: "review",
    reason: "orientacion para examen o repaso",
    regex:
      /\b(examen|tribunal|respuesta modelo|repaso|para estudiar|para memorizar|preg[uú]ntame|comprueba)\b/i,
    confidence: 0.88,
  },
  {
    mode: "comparison",
    reason: "comparacion entre conceptos",
    regex:
      /\b(compara|comparar|diferencia|diferencias|semejanza|semejanzas|versus| vs\.? |relaci[oó]n entre)\b/i,
    confidence: 0.9,
  },
  {
    mode: "step_by_step",
    reason: "explicacion secuencial",
    regex:
      /\b(paso a paso|pasos|procedimiento|proceso|secuencia|orden|fases|etapas)\b/i,
    confidence: 0.88,
  },
  {
    mode: "simple",
    reason: "solicitud de lenguaje sencillo",
    regex:
      /\b(f[aá]cil|sencill[oa]|simple|no entend[ií]|no comprendo|otra manera|m[aá]s claro|muy complicado|qu[eé] significa)\b/i,
    confidence: 0.91,
  },
  {
    mode: "deep",
    reason: "solicitud de profundizacion",
    regex:
      /\b(profundiza|m[aá]s detalle|completo|desarrolla bastante|expl[ií]came todo|ampl[ií]a)\b/i,
    confidence: 0.84,
  },
  {
    mode: "academic",
    reason: "solicitud formal academica",
    regex:
      /\b(acad[eé]mico|formal|t[eé]cnico|desarrolla este concepto|fundamenta|argumenta)\b/i,
    confidence: 0.82,
  },
];

const reformulationRegex =
  /\b(no entend[ií]|no comprendo|otra manera|m[aá]s f[aá]cil|m[aá]s claro|est[aá] complicado|expl[ií]camelo de nuevo|rep[ií]teme)\b/i;
const preferenceRegex =
  /\b(prefiero|quiero que siempre|expl[ií]came siempre|h[aá]blame siempre|me sirve m[aá]s)\b/i;

export function detectPedagogicalMode(input: {
  message: string;
  requestedMode?: TutorMode | null;
  preference?: PedagogicalPreference | null;
}): ModeDetectionResult {
  const requested =
    input.requestedMode && canonicalTutorMode(input.requestedMode);
  const reformulationRequested = reformulationRegex.test(input.message);
  const explicitPreference = preferenceRegex.test(input.message);

  if (requested && requested !== "normal") {
    return {
      mode: requested,
      confidence: 1,
      reason: "modo seleccionado por el estudiante",
      reformulationRequested,
      explicitPreference,
    };
  }

  for (const pattern of patterns) {
    if (pattern.regex.test(input.message)) {
      return {
        mode: canonicalTutorMode(pattern.mode),
        confidence: pattern.confidence,
        reason: pattern.reason,
        reformulationRequested,
        explicitPreference,
      };
    }
  }

  const preferred = input.preference?.preferredMode
    ? canonicalTutorMode(input.preference.preferredMode)
    : null;
  if (preferred && preferred !== "normal") {
    return {
      mode: preferred,
      confidence: 0.72,
      reason: "preferencia pedagogica guardada",
      reformulationRequested,
      explicitPreference,
    };
  }

  return {
    mode: "normal",
    confidence: 0.55,
    reason: "modo predeterminado equilibrado",
    reformulationRequested,
    explicitPreference,
  };
}
