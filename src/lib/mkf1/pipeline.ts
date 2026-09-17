import { createHash } from "node:crypto";
import { OFFICIAL_UNITS } from "@/lib/units";
import {
  KnowledgeObjectSchema,
  type CognitiveObjective,
  type ContentType,
  type KnowledgeObject,
  type KnowledgeRelation,
  type SourceScope,
} from "@/lib/mkf1/schema";

export type ParsedMkfUnit = {
  unitNumber: number;
  unitName: string;
  content: string;
  topics: MkfTopic[];
};

export type MkfTopic = {
  number: string | null;
  name: string;
  content: string;
  blocks: MkfBlock[];
};

type MkfBlock = {
  sectionNumber: string | null;
  sectionName: string | null;
  content: string;
};

export type MkfPipelineResult = {
  schema_version: "MKF-1.0";
  document: string;
  detected_units: number;
  expected_units: number;
  units: ParsedMkfUnit[];
  knowledge_objects: KnowledgeObject[];
  relations: KnowledgeRelation[];
  errors: string[];
  warnings: string[];
};

const COMPENDIUM = "Compendio FATESCIPOL El Alto – Examen de Grado 2026";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value: string) {
  return normalize(value)
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function hashSource(value: string) {
  return createHash("sha256").update(normalize(value)).digest("hex");
}

function unitHeadingRegex(unitNumber: number, unitName: string) {
  const nameWords = normalize(unitName)
    .toLowerCase()
    .split(" ")
    .filter((word) => word.length > 3)
    .slice(0, 5)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(
    `(?:unidad\\s*(?:tem[aá]tica)?\\s*)?${unitNumber}(?:[\\s\\S]{0,120}${nameWords.join("[\\s\\S]{0,80}")})`,
    "i",
  );
}

export function detectUnits(text: string) {
  const headingMatches: Array<{
    unit: (typeof OFFICIAL_UNITS)[number];
    index: number;
  }> = [];
  const headingRegex = /UNIDAD\s+TEM[ÁA]TICA\s+(\d{1,2})/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(text))) {
    const number = Number(match[1]);
    const unit = OFFICIAL_UNITS.find((item) => item.number === number);
    if (unit) headingMatches.push({ unit, index: match.index });
  }
  if (new Set(headingMatches.map((item) => item.unit.number)).size === 15) {
    return headingMatches.sort((a, b) => a.index - b.index);
  }
  return OFFICIAL_UNITS.map((unit) => {
    const regexMatch = text.match(unitHeadingRegex(unit.number, unit.name));
    const direct = text.toLowerCase().indexOf(unit.name.toLowerCase());
    return {
      unit,
      index: regexMatch?.index ?? direct,
    };
  })
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
}

function isHeading(line: string) {
  const clean = line.replace(/\s+/g, " ").trim();
  if (clean.length < 6 || clean.length > 180) return false;
  return /^(\d+(?:\.\d+)*[.)-]?\s*)?[A-ZÁÉÍÓÚÑ0-9 ,;:()/-]{6,}$/.test(
    clean,
  );
}

function splitTopics(content: string) {
  const lines = content.split(/\r?\n/);
  const topics: MkfTopic[] = [];
  let currentTitle = "Tema general";
  let currentNumber: string | null = null;
  let current: string[] = [];
  const flush = () => {
    const text = current.join("\n").trim();
    if (text.length < 40) return;
    topics.push({
      number: currentNumber,
      name: currentTitle.replace(/^\d+(?:\.\d+)*\s*/, "").trim(),
      content: text,
      blocks: splitBlocks(text, currentNumber, currentTitle),
    });
  };
  for (const line of lines) {
    const clean = line.trim();
    const numbered = clean.match(/^(\d+(?:\.\d+)+)\s+(.+)/);
    if ((numbered || isHeading(clean)) && current.join("\n").length > 180) {
      flush();
      current = [];
      currentNumber = numbered?.[1] || clean.match(/^(\d+(?:\.\d+)*)/)?.[1] || null;
      currentTitle = clean;
    } else if (numbered || (isHeading(clean) && current.length === 0)) {
      currentNumber = numbered?.[1] || clean.match(/^(\d+(?:\.\d+)*)/)?.[1] || currentNumber;
      currentTitle = clean;
    }
    if (clean) current.push(clean);
  }
  flush();
  return topics.length
    ? topics
    : [
        {
          number: null,
          name: "Tema general",
          content,
          blocks: splitBlocks(content, null, "Tema general"),
        },
      ];
}

function splitBlocks(content: string, topicNumber: string | null, topic: string) {
  const rawBlocks = content
    .split(/\n{2,}|(?=\n\s*(?:[-•]|\d+[.)])\s+)/)
    .map((block) => block.trim())
    .filter((block) => block.length > 30);
  return rawBlocks.map((block): MkfBlock => ({
    sectionNumber: block.match(/^(\d+(?:\.\d+)*)/)?.[1] || topicNumber,
    sectionName: topic,
    content: block,
  }));
}

export function parseDocument(text: string): ParsedMkfUnit[] {
  const starts = detectUnits(text);
  const byUnit = new Map<number, ParsedMkfUnit>();
  for (let index = 0; index < starts.length; index += 1) {
    const current = starts[index];
    const next = starts[index + 1];
    const content = text.slice(current.index, next?.index ?? text.length).trim();
    if (content.length < 120) continue;
    byUnit.set(current.unit.number, {
      unitNumber: current.unit.number,
      unitName: current.unit.name,
      content,
      topics: splitTopics(content),
    });
  }
  return OFFICIAL_UNITS.map((unit) => byUnit.get(unit.number)).filter(
    (unit): unit is ParsedMkfUnit => Boolean(unit),
  );
}

function classify(content: string): { type: ContentType; confidence: number } {
  const text = normalize(content).toLowerCase();
  if (/\bart[íi]culo\s+\d+|\bley\s+n|\bdecreto\b|\breglamento\b/.test(text))
    return { type: /art[íi]culo\s+\d+/.test(text) ? "ARTICLE" : "NORMATIVE", confidence: 0.82 };
  if (/\bprocedimiento\b|\bpasos?\b|\bprimero\b|\bsegundo\b|\btercero\b/.test(text))
    return { type: "PROCEDURE", confidence: 0.78 };
  if (/\bse define\b|\bes\s+(el|la|un|una)\b|\bse entiende por\b|\bconcepto\b/.test(text))
    return { type: "DEFINITION", confidence: 0.76 };
  if (/\bprincipios?\b/.test(text)) return { type: "PRINCIPLE", confidence: 0.73 };
  if (/\bvalores?\b/.test(text)) return { type: "VALUE", confidence: 0.73 };
  if (/\bcaracter[íi]sticas?\b/.test(text)) return { type: "CHARACTERISTIC", confidence: 0.72 };
  if (/^([-•]|\d+[.)])\s+/m.test(content) || content.split(/;|\n-/).length >= 4)
    return { type: "ENUMERATION", confidence: 0.74 };
  if (/\bejemplo\b/.test(text)) return { type: "EXAMPLE", confidence: 0.75 };
  if (/\baplicaci[óo]n\b|\bfunci[óo]n policial\b/.test(text))
    return { type: "APPLICATION", confidence: 0.7 };
  if (/conocimiento acad[ée]mico general/.test(text))
    return { type: "GENERAL_ACADEMIC_KNOWLEDGE", confidence: 0.86 };
  return { type: "OTHER", confidence: 0.55 };
}

function conceptFrom(block: MkfBlock) {
  const firstLine =
    block.content.split(/\r?\n/).find((line) => line.trim().length > 3) ||
    block.sectionName ||
    "Concepto";
  const cleaned = firstLine
    .replace(/^UNIDAD\s+TEM[ÁA]TICA\s+\d{1,2}\b/i, "")
    .replace(/^[-•\d.)\s]+/, "")
    .replace(/[:.;]\s*$/, "")
    .trim();
  return (cleaned || block.sectionName || "Concepto").slice(0, 120);
}

function keywordsFor(text: string, concept: string) {
  const stop = new Set(["para", "como", "sobre", "entre", "desde", "este", "esta", "donde", "policial", "policia", "unidad", "tema"]);
  const words = normalize(`${concept} ${text}`)
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter((word) => word.length > 4 && !stop.has(word));
  return [...new Set(words)].slice(0, 12);
}

function objectivesFor(type: ContentType): CognitiveObjective[] {
  if (type === "PROCEDURE") return ["IDENTIFY", "ORDER", "EXPLAIN", "APPLY"];
  if (type === "ENUMERATION" || type === "PRINCIPLE" || type === "VALUE")
    return ["IDENTIFY", "ENUMERATE", "EXPLAIN", "RELATE"];
  if (type === "DEFINITION") return ["DEFINE", "EXPLAIN", "APPLY"];
  if (type === "COMPARISON") return ["DISTINGUISH", "RELATE", "ARGUE"];
  return ["IDENTIFY", "EXPLAIN"];
}

function sourceScopeFor(type: ContentType, content: string): SourceScope {
  if (type === "GENERAL_ACADEMIC_KNOWLEDGE" || /conocimiento acad[ée]mico general/i.test(content))
    return "GENERAL_ACADEMIC_KNOWLEDGE";
  return "OFFICIAL_SOURCE";
}

function procedureSteps(content: string) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const stepLines = lines.filter((line) => /^\d+[.)]\s+|^(primero|segundo|tercero|cuarto|quinto)\b/i.test(line));
  return (stepLines.length ? stepLines : lines.slice(0, 6)).map((line, index) => ({
    order: index + 1,
    title: line.replace(/^\d+[.)]\s+/, "").split(/[:.;]/)[0]?.slice(0, 80) || null,
    content: line,
  }));
}

function buildObject(unit: ParsedMkfUnit, topic: MkfTopic, block: MkfBlock, index: number) {
  const classified = classify(block.content);
  const concept = conceptFrom(block);
  const sourceHash = hashSource(block.content);
  const confidence = classified.confidence;
  const hierarchyConfidence = topic.number ? 0.82 : 0.64;
  const requiresReview = confidence < 0.7 || hierarchyConfidence < 0.7;
  const knowledgeId = `U${String(unit.unitNumber).padStart(2, "0")}-${slug(concept || topic.name)}-${sourceHash.slice(0, 8).toUpperCase()}`;
  const expected = concept
    ? [{ concept, required: true, weight: classified.type === "DEFINITION" ? 0.5 : 0.35 }]
    : [];
  return KnowledgeObjectSchema.parse({
    schema_version: "MKF-1.0",
    knowledge_id: knowledgeId,
    document_version: "2026",
    knowledge_version: 1,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    active: true,
    hierarchy: {
      unit_id: `U${String(unit.unitNumber).padStart(2, "0")}`,
      unit_number: unit.unitNumber,
      unit_name: unit.unitName,
      topic_number: topic.number,
      topic_name: topic.name,
      section_number: block.sectionNumber,
      section_name: block.sectionName,
    },
    knowledge: {
      concept,
      title: concept || topic.name,
      content_type: classified.type,
      source_content: block.content,
      parent_id: null,
      child_ids: [],
      sequence_required: classified.type === "PROCEDURE",
      steps: classified.type === "PROCEDURE" ? procedureSteps(block.content) : [],
      source_hash: sourceHash,
    },
    retrieval: {
      keywords: keywordsFor(block.content, concept),
      aliases: [],
      related_concepts: [],
      search_terms: keywordsFor(block.content, `${topic.name} ${concept}`).slice(0, 8),
    },
    provenance: {
      scope: sourceScopeFor(classified.type, block.content),
      compendium: COMPENDIUM,
      original_source: COMPENDIUM,
      year: 2026,
      page_start: null,
      page_end: null,
      source_reference: topic.number,
    },
    pedagogy: {
      importance: index < 3 ? "HIGH" : "MEDIUM",
      difficulty: classified.type === "NORMATIVE" || classified.type === "ARTICLE" ? "ADVANCED" : "BASIC",
      learning_objectives: objectivesFor(classified.type),
      prerequisites: [],
      common_confusions: requiresReview ? ["Clasificación o jerarquía requiere revisión humana."] : [],
      suitable_for_example: !["ARTICLE", "SOURCE_NOTE"].includes(classified.type),
      suitable_for_case: ["APPLICATION", "PROCEDURE", "RULE", "NORMATIVE"].includes(classified.type),
      suitable_for_oral_exam: true,
      generated_metadata: true,
    },
    assessment: {
      can_ask_definition: classified.type === "DEFINITION",
      can_ask_enumeration: ["ENUMERATION", "PRINCIPLE", "VALUE", "CLASSIFICATION"].includes(classified.type),
      can_ask_explanation: true,
      can_ask_comparison: classified.type === "COMPARISON",
      can_ask_application: !["SOURCE_NOTE"].includes(classified.type),
      can_ask_ordering: classified.type === "PROCEDURE",
      can_generate_followup: true,
      expected_concepts: expected,
    },
    validation: {
      structure_valid: true,
      source_preserved: true,
      classification_confidence: confidence,
      hierarchy_confidence: hierarchyConfidence,
      requires_review: requiresReview,
      warnings: requiresReview ? ["Revisar clasificación o jerarquía antes de usar en evaluación estricta."] : [],
    },
  });
}

export function buildKnowledgeObjects(units: ParsedMkfUnit[]) {
  const objects: KnowledgeObject[] = [];
  const relations: KnowledgeRelation[] = [];
  for (const unit of units) {
    for (const topic of unit.topics) {
      const topicObjects = topic.blocks.slice(0, 80).map((block, index) =>
        buildObject(unit, topic, block, index),
      );
      objects.push(...topicObjects);
      for (let index = 1; index < topicObjects.length; index += 1) {
        relations.push({
          from_id: topicObjects[index - 1].knowledge_id,
          to_id: topicObjects[index].knowledge_id,
          relation_type: "PRECEDES",
          confidence: 0.72,
          generated_metadata: true,
        });
        relations.push({
          from_id: topicObjects[index].knowledge_id,
          to_id: topicObjects[index - 1].knowledge_id,
          relation_type: "FOLLOWS",
          confidence: 0.72,
          generated_metadata: true,
        });
      }
    }
  }
  return { objects, relations };
}

export function runMkfPipeline(text: string, document = COMPENDIUM): MkfPipelineResult {
  const units = parseDocument(text);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (units.length !== 15) {
    errors.push(`VALIDACIÓN CRÍTICA: detected_units=${units.length}; expected_units=15.`);
  }
  const { objects, relations } = buildKnowledgeObjects(units);
  return {
    schema_version: "MKF-1.0",
    document,
    detected_units: units.length,
    expected_units: 15,
    units,
    knowledge_objects: objects,
    relations,
    errors,
    warnings,
  };
}
