import { OFFICIAL_UNITS } from "@/lib/units";
import type { AcademicIntent, QueryAnalysis } from "@/lib/knowledge/types";

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function analyzeQuery(query: string): QueryAnalysis {
  const normalizedQuery = normalize(query);
  let intent: AcademicIntent = "general_question";
  if (/\b(que es|define|definicion|concepto)\b/.test(normalizedQuery))
    intent = "definition";
  else if (/\b(cuales son|enumera|lista|tipos|caracteristicas|principios|valores)\b/.test(normalizedQuery))
    intent = "enumeration";
  else if (/\b(diferencia|compara|versus| vs )\b/.test(normalizedQuery))
    intent = "comparison";
  else if (/\b(procedimiento|pasos|orden|como se realiza)\b/.test(normalizedQuery))
    intent = "procedure";
  else if (/\b(ejemplo|caso practico|situacion)\b/.test(normalizedQuery))
    intent = "example";
  else if (/\b(examen|pregunta|tribunal|oral|preparame)\b/.test(normalizedQuery))
    intent = "exam_question";
  else if (/\b(explica|explicame|importancia|significa)\b/.test(normalizedQuery))
    intent = "explanation";

  const probableUnit = OFFICIAL_UNITS.find((unit) => {
    const unitName = normalize(unit.name);
    return (
      normalizedQuery.includes(unitName) ||
      unitName.split(" ").filter((word) => word.length > 5).some((word) => normalizedQuery.includes(word))
    );
  });

  const entities = normalizedQuery
    .split(" ")
    .filter((word) => word.length > 4)
    .filter(
      (word) =>
        ![
          "explica",
          "explicame",
          "cuales",
          "concepto",
          "ejemplo",
          "pregunta",
          "importancia",
        ].includes(word),
    )
    .slice(0, 8);

  return {
    query,
    normalizedQuery,
    intent,
    probableUnitNumber: probableUnit?.number || null,
    topicHint: entities.slice(0, 3).join(" ") || null,
    entities,
    responseType: intent,
  };
}
