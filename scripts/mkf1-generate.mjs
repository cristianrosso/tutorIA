import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { z } from "zod";

const defaultDocx =
  "C:/Users/ZBook/Downloads/COMPENDIO_FATESCIPOL_EL_ALTO_2026_CORREGIDO_SIN_CAPITULOS.docx";
const sourcePath = process.argv[2] || defaultDocx;
const reportsDir = "reports/mkf1";
const schemaVersion = "MKF-1.0";
const compendium = "Compendio FATESCIPOL El Alto – Examen de Grado 2026";

const units = [
  [1, "Doctrina Policial"],
  [2, "Patrullaje Policial"],
  [3, "Seguridad de Instalaciones"],
  [4, "Investigación Criminal"],
  [5, "Educación Vial e Investigación de Accidentes de Tránsito"],
  [6, "Operaciones Policiales"],
  [7, "Fundamentos Jurídicos de la Función Policial"],
  [8, "Derechos Humanos Aplicados a la Función Policial"],
  [9, "Derecho Penal y Derecho Procesal Penal Aplicados a la Función Policial"],
  [10, "Género y Violencia Intrafamiliar"],
  [11, "Legislación Policial y Seguridad Ciudadana"],
  [12, "Expresión Oral, Ética y Relaciones Humanas"],
  [13, "Psicología Aplicada a la Función Policial"],
  [14, "Soporte Vital Básico (Técnica MARCH)"],
  [15, "Metodología de la Investigación Científica"],
];

const contentTypes = [
  "DEFINITION",
  "ENUMERATION",
  "CLASSIFICATION",
  "PRINCIPLE",
  "VALUE",
  "CHARACTERISTIC",
  "RULE",
  "NORMATIVE",
  "ARTICLE",
  "PROCEDURE",
  "PROCEDURE_STEP",
  "REQUIREMENT",
  "EXCEPTION",
  "COMPARISON",
  "CAUSE_EFFECT",
  "EXAMPLE",
  "APPLICATION",
  "CASE",
  "FORMULA",
  "METHODOLOGY",
  "SOURCE_NOTE",
  "GENERAL_ACADEMIC_KNOWLEDGE",
  "OTHER",
];

const objectSchema = z.object({
  schema_version: z.literal(schemaVersion),
  knowledge_id: z.string(),
  hierarchy: z.object({ unit_number: z.number(), unit_name: z.string() }),
  knowledge: z.object({
    content_type: z.enum(contentTypes),
    source_content: z.string().min(1),
    source_hash: z.string(),
  }),
  validation: z.object({
    source_preserved: z.literal(true),
    requires_review: z.boolean(),
  }),
});

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return normalize(value)
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 44);
}

function hash(value) {
  return createHash("sha256").update(normalize(value)).digest("hex");
}

function docxToText(file) {
  const py = `import zipfile, sys\npath=sys.argv[1]\nwith zipfile.ZipFile(path) as z:\n    data=z.read('word/document.xml').decode('utf-8')\nsys.stdout.buffer.write(data.encode('utf-8'))`;
  const xml = execFileSync("python", ["-c", py, file], {
    encoding: "utf8",
    maxBuffer: 120 * 1024 * 1024,
  });
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function loadText(file) {
  if (!existsSync(file)) throw new Error(`No existe el archivo: ${file}`);
  if (extname(file).toLowerCase() === ".docx") return docxToText(file);
  return readFileSync(file, "utf8");
}

function findUnitStarts(text) {
  const starts = [];
  const byHeading = /UNIDAD\s+TEM[ÁA]TICA\s+(\d{1,2})/gi;
  let match;
  while ((match = byHeading.exec(text))) {
    const number = Number(match[1]);
    const unit = units.find(([n]) => n === number);
    if (unit) starts.push({ number, name: unit[1], index: match.index });
  }
  if (new Set(starts.map((s) => s.number)).size === 15)
    return starts.sort((a, b) => a.index - b.index);
  return units
    .map(([number, name]) => ({
      number,
      name,
      index: normalize(text).toLowerCase().indexOf(normalize(name).toLowerCase()),
    }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
}

function isHeading(line) {
  const clean = line.replace(/\s+/g, " ").trim();
  return (
    clean.length >= 6 &&
    clean.length <= 180 &&
    /^(\d+(?:\.\d+)*[.)-]?\s*)?[A-ZÁÉÍÓÚÑ0-9 ,;:()/-]{6,}$/.test(clean)
  );
}

function splitBlocks(content) {
  return content
    .split(/\n{2,}|(?=\n\s*(?:[-•]|\d+[.)])\s+)/)
    .map((block) => block.trim())
    .filter((block) => block.length > 40);
}

function splitTopics(content) {
  const lines = content.split(/\r?\n/);
  const topics = [];
  let title = "Tema general";
  let number = null;
  let buffer = [];
  function flush() {
    const text = buffer.join("\n").trim();
    if (text.length < 80) return;
    topics.push({ number, name: title.replace(/^\d+(?:\.\d+)*\s*/, "").trim(), content: text });
  }
  for (const line of lines) {
    const clean = line.trim();
    const numbered = clean.match(/^(\d+(?:\.\d+)+)\s+(.+)/);
    if ((numbered || isHeading(clean)) && buffer.join("\n").length > 250) {
      flush();
      buffer = [];
      number = numbered?.[1] || clean.match(/^(\d+(?:\.\d+)*)/)?.[1] || null;
      title = clean;
    } else if (numbered || (isHeading(clean) && buffer.length === 0)) {
      number = numbered?.[1] || clean.match(/^(\d+(?:\.\d+)*)/)?.[1] || number;
      title = clean;
    }
    if (clean) buffer.push(clean);
  }
  flush();
  return topics.length ? topics : [{ number: null, name: "Tema general", content }];
}

function classify(content) {
  const text = normalize(content).toLowerCase();
  if (/\bart[íi]culo\s+\d+/.test(text)) return ["ARTICLE", 0.82];
  if (/\bley\s+n|\bdecreto\b|\breglamento\b|\bnormativa\b/.test(text)) return ["NORMATIVE", 0.8];
  if (/\bprocedimiento\b|\bpasos?\b|\bprimero\b|\bsegundo\b|\btercero\b/.test(text)) return ["PROCEDURE", 0.78];
  if (/\bse define\b|\bse entiende por\b|\bconcepto\b/.test(text)) return ["DEFINITION", 0.76];
  if (/\bprincipios?\b/.test(text)) return ["PRINCIPLE", 0.73];
  if (/\bvalores?\b/.test(text)) return ["VALUE", 0.73];
  if (/\bcaracter[íi]sticas?\b/.test(text)) return ["CHARACTERISTIC", 0.72];
  if (/^([-•]|\d+[.)])\s+/m.test(content) || content.split(/;|\n-/).length >= 4) return ["ENUMERATION", 0.74];
  if (/\bejemplo\b/.test(text)) return ["EXAMPLE", 0.75];
  if (/conocimiento acad[ée]mico general/.test(text)) return ["GENERAL_ACADEMIC_KNOWLEDGE", 0.86];
  if (/\baplicaci[óo]n\b|\bfunci[óo]n policial\b/.test(text)) return ["APPLICATION", 0.7];
  return ["OTHER", 0.55];
}

function conceptOf(block, topicName) {
  return (block.split(/\r?\n/).find(Boolean) || topicName || "Concepto")
    .replace(/^[-•\d.)\s]+/, "")
    .replace(/[:.;]\s*$/, "")
    .trim()
    .slice(0, 120);
}

function objectFor(unit, topic, block, index) {
  const [type, confidence] = classify(block);
  const hierarchyConfidence = topic.number ? 0.82 : 0.64;
  const sourceHash = hash(block);
  const concept = conceptOf(block, topic.name);
  const requiresReview = confidence < 0.7 || hierarchyConfidence < 0.7;
  return {
    schema_version: schemaVersion,
    knowledge_id: `U${String(unit.number).padStart(2, "0")}-${slug(concept)}-${sourceHash.slice(0, 8).toUpperCase()}`,
    document_version: "2026",
    knowledge_version: 1,
    active: true,
    hierarchy: {
      unit_id: `U${String(unit.number).padStart(2, "0")}`,
      unit_number: unit.number,
      unit_name: unit.name,
      topic_number: topic.number,
      topic_name: topic.name,
      section_number: topic.number,
      section_name: topic.name,
    },
    knowledge: {
      concept,
      title: concept,
      content_type: type,
      source_content: block,
      parent_id: null,
      child_ids: [],
      sequence_required: type === "PROCEDURE",
      steps: type === "PROCEDURE" ? splitBlocks(block).slice(0, 8).map((content, i) => ({ order: i + 1, title: content.split(/[:.;]/)[0].slice(0, 80), content })) : [],
      source_hash: sourceHash,
    },
    retrieval: { keywords: [...new Set(normalize(`${concept} ${block}`).toLowerCase().split(/[^a-z0-9ñ]+/).filter((w) => w.length > 4))].slice(0, 12), aliases: [], related_concepts: [], search_terms: [] },
    provenance: { scope: type === "GENERAL_ACADEMIC_KNOWLEDGE" ? "GENERAL_ACADEMIC_KNOWLEDGE" : "OFFICIAL_SOURCE", compendium, original_source: compendium, year: 2026, page_start: null, page_end: null, source_reference: topic.number },
    pedagogy: { importance: index < 3 ? "HIGH" : "MEDIUM", difficulty: ["ARTICLE", "NORMATIVE"].includes(type) ? "ADVANCED" : "BASIC", learning_objectives: type === "PROCEDURE" ? ["IDENTIFY", "ORDER", "EXPLAIN", "APPLY"] : type === "DEFINITION" ? ["DEFINE", "EXPLAIN", "APPLY"] : ["IDENTIFY", "EXPLAIN"], prerequisites: [], common_confusions: requiresReview ? ["Requiere revisión humana antes de evaluación estricta."] : [], suitable_for_example: type !== "ARTICLE", suitable_for_case: ["APPLICATION", "PROCEDURE", "NORMATIVE"].includes(type), suitable_for_oral_exam: true, generated_metadata: true },
    assessment: { can_ask_definition: type === "DEFINITION", can_ask_enumeration: ["ENUMERATION", "PRINCIPLE", "VALUE"].includes(type), can_ask_explanation: true, can_ask_comparison: false, can_ask_application: type !== "SOURCE_NOTE", can_ask_ordering: type === "PROCEDURE", can_generate_followup: true, expected_concepts: [{ concept, required: true, weight: type === "DEFINITION" ? 0.5 : 0.35 }] },
    validation: { structure_valid: true, source_preserved: true, classification_confidence: confidence, hierarchy_confidence: hierarchyConfidence, requires_review: requiresReview, warnings: requiresReview ? ["Clasificación o jerarquía con confianza baja."] : [] },
  };
}

function run(text) {
  const starts = findUnitStarts(text);
  const parsed = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = starts[i + 1]?.index ?? text.length;
    const content = text.slice(start.index, end).trim();
    if (content.length < 120) continue;
    parsed.push({ ...start, content, topics: splitTopics(content) });
  }
  const objects = [];
  const relations = [];
  for (const unit of parsed) {
    for (const topic of unit.topics) {
      const topicObjects = splitBlocks(topic.content).slice(0, 80).map((block, index) => objectFor(unit, topic, block, index));
      objects.push(...topicObjects);
      for (let i = 1; i < topicObjects.length; i += 1) {
        relations.push({ from_id: topicObjects[i - 1].knowledge_id, to_id: topicObjects[i].knowledge_id, relation_type: "PRECEDES", confidence: 0.72, generated_metadata: true });
        relations.push({ from_id: topicObjects[i].knowledge_id, to_id: topicObjects[i - 1].knowledge_id, relation_type: "FOLLOWS", confidence: 0.72, generated_metadata: true });
      }
    }
  }
  return { parsed, objects, relations };
}

function countBy(items, getter) {
  const out = {};
  for (const item of items) out[getter(item)] = (out[getter(item)] || 0) + 1;
  return out;
}

function writeJson(name, value) {
  writeFileSync(join(reportsDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

mkdirSync(reportsDir, { recursive: true });
const text = loadText(sourcePath);
const normalizedText = normalize(text);
const { parsed, objects, relations } = run(text);
const errors = [];
if (parsed.length !== 15) errors.push(`VALIDACIÓN CRÍTICA: detected_units=${parsed.length}; expected_units=15.`);
for (const sample of objects.slice(0, 50)) objectSchema.parse(sample);
const typeCounts = countBy(objects, (object) => object.knowledge.content_type);
const review = objects.filter((object) => object.validation.requires_review);
const unitsReport = parsed.map((unit) => {
  const unitObjects = objects.filter((object) => object.hierarchy.unit_number === unit.number);
  const unitRelations = relations.filter((relation) => unitObjects.some((object) => object.knowledge_id === relation.from_id));
  return {
    unit_id: `U${String(unit.number).padStart(2, "0")}`,
    unit_number: unit.number,
    unit_name: unit.name,
    topics: unit.topics.length,
    knowledge_objects: unitObjects.length,
    definitions: unitObjects.filter((object) => object.knowledge.content_type === "DEFINITION").length,
    enumerations: unitObjects.filter((object) => object.knowledge.content_type === "ENUMERATION").length,
    procedures: unitObjects.filter((object) => object.knowledge.content_type === "PROCEDURE").length,
    normative_objects: unitObjects.filter((object) => ["NORMATIVE", "ARTICLE", "RULE"].includes(object.knowledge.content_type)).length,
    examples: unitObjects.filter((object) => object.knowledge.content_type === "EXAMPLE").length,
    relations: unitRelations.length,
    review_required: unitObjects.filter((object) => object.validation.requires_review).length,
  };
});
const summary = {
  schema_version: schemaVersion,
  document_processed: basename(sourcePath),
  generated_at: new Date().toISOString(),
  expected_units: 15,
  detected_units: parsed.length,
  topics_detected: parsed.reduce((sum, unit) => sum + unit.topics.length, 0),
  knowledge_objects: objects.length,
  knowledge_types: typeCounts,
  review_required: review.length,
  objects_without_source: objects.filter((object) => !object.knowledge.source_content).length,
  relations: relations.length,
  errors,
  note: "Sprint 5A no genera embeddings ni reemplaza el RAG existente.",
};
writeJson("mkf1-summary.json", summary);
writeJson("mkf1-units.json", unitsReport);
writeJson("mkf1-knowledge-types.json", typeCounts);
writeJson("mkf1-review-required.json", review.map((object) => ({ knowledge_id: object.knowledge_id, unit: object.hierarchy.unit_number, title: object.knowledge.title, content_type: object.knowledge.content_type, validation: object.validation })));
writeJson("mkf1-relations.json", { total: relations.length, sample: relations.slice(0, 500) });
writeJson("mkf1-validation.json", { source_preserved_samples: objects.slice(0, 25).map((object) => ({ knowledge_id: object.knowledge_id, source_hash: object.knowledge.source_hash, preserved: normalizedText.includes(normalize(object.knowledge.source_content).slice(0, Math.min(120, normalize(object.knowledge.source_content).length))) })), errors, warnings: review.length ? [`${review.length} objetos requieren revisión humana.`] : [] });
console.log(JSON.stringify(summary, null, 2));
