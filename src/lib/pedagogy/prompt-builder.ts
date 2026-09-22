import type {
  AcademicIntent,
  KnowledgeChunkCandidate,
} from "@/lib/knowledge/types";
import { buildExampleInstruction } from "@/lib/pedagogy/example-builder";
import { strategyInstruction } from "@/lib/pedagogy/strategy-selector";
import type { PedagogicalPromptInput, TutorMode } from "@/lib/pedagogy/types";
import { modeInstruction } from "@/lib/tutor/prompts/system-prompt";

export function maxTokensForMode(mode: TutorMode) {
  const limits: Record<TutorMode, number> = {
    normal: 950,
    quick: 420,
    explain: 760,
    simple: 760,
    academic: 1050,
    deep: 1300,
    example: 850,
    review: 920,
    comparison: 1050,
    step_by_step: 980,
  };
  return limits[mode];
}

export function buildMultilevelPedagogicalPrompt(
  input: PedagogicalPromptInput,
) {
  return `
Modo pedagógico efectivo: ${input.mode}
Instrucción del modo: ${modeInstruction(input.mode)}
Estrategia pedagógica seleccionada: ${input.strategy}
Instrucción de estrategia: ${strategyInstruction(input.strategy)}
Intención académica detectada: ${input.queryIntent}

Historial breve relevante:
${input.history || "Sin historial previo relevante."}

Memoria académica estructurada del estudiante:
${input.memoryContext}

Recomendaciones adaptativas calculadas sin IA:
${input.adaptiveContext}

Plan de estudio real del estudiante:
${input.studyPlanContext}

Pregunta actual del estudiante:
${input.query}

Contexto académico recuperado del compendio:
${input.context}

Fuentes para mostrar de forma sencilla:
${formatSources(input.availableSources)}

Reglas de respuesta multinivel:
${modeStructure(input.mode, input.queryIntent)}

${buildExampleInstruction({ query: input.query, sources: input.availableSources })}

Instrucciones obligatorias:
- Responde como profesor experto: natural, claro y directo, sin sonar como plantilla rígida.
- Usa el contexto académico recuperado como base del contenido oficial.
- Diferencia lógicamente contenido del compendio, explicación generada y ejemplo didáctico cuando existan.
- Si el estudiante pide ejemplo, puedes empezar por el ejemplo y después conectar con el concepto.
- Si el estudiante dice que no entendió, no repitas literalmente: cambia la estrategia y conserva el significado académico.
- Si faltan fuentes suficientes para una parte de la respuesta, indícalo sin inventar.
- No inventes normas, artículos, procedimientos, fechas, sanciones, atribuciones ni definiciones oficiales.
- Si el estudiante pregunta por su plan o progreso, usa primero el plan de estudio real y la memoria académica.
- Incluye una sección breve llamada "Fuente" con Compendio FATESCIPOL, unidad y tema, sin IDs internos.
`.trim();
}

function formatSources(sources: KnowledgeChunkCandidate[]) {
  const sourceList = sources
    .map((source, index) => {
      const unit = source.unitNumber
        ? `Unidad ${source.unitNumber}${source.unitName ? ` - ${source.unitName}` : ""}`
        : "Unidad no determinada";
      const topic =
        source.topicName ||
        source.sectionName ||
        source.title ||
        "Tema recuperado";
      return `Fuente ${index + 1}: Compendio FATESCIPOL 2026, ${unit}, ${topic}.`;
    })
    .join("\n");
  return sourceList || "Sin fuentes suficientes.";
}

function modeStructure(mode: TutorMode, intent: AcademicIntent) {
  if (mode === "quick")
    return "Estructura: respuesta central en 2 a 5 frases, idea clave y fuente.";
  if (mode === "simple")
    return "Estructura: concepto base breve, explicación sencilla, ejemplo corto si ayuda y pregunta de comprobación opcional.";
  if (mode === "academic")
    return "Estructura: concepto, definición académica, elementos o características respaldadas, aplicación y fuente.";
  if (mode === "deep")
    return "Estructura: desarrollo amplio con relaciones conceptuales, límites de la fuente, ejemplo y síntesis final.";
  if (mode === "example")
    return "Estructura: ejemplo didáctico concreto, conexión con el concepto oficial, explicación breve e idea clave.";
  if (mode === "review")
    return "Estructura: tema, definición fundamental, elementos que debe recordar, aplicación, idea para examen y pregunta de comprobación.";
  if (mode === "comparison")
    return "Estructura: concepto A, concepto B, semejanzas, diferencias y aplicación. Usa tabla si mejora la claridad.";
  if (mode === "step_by_step")
    return "Estructura: objetivo del procedimiento o proceso, pasos/fases en orden, explicación de cada etapa y ejemplo de aplicación.";
  if (intent === "procedure")
    return "Estructura: objetivo, secuencia, explicación de etapas y fuente.";
  if (intent === "comparison")
    return "Estructura: definiciones comparadas, semejanzas, diferencias y fuente.";
  return "Estructura flexible: responde según la pregunta, con concepto base, explicación, ejemplo o comprobación solo cuando ayude.";
}
