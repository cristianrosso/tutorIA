import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const defaultDocx =
  "C:/Users/ZBook/Downloads/COMPENDIO_FATESCIPOL_EL_ALTO_2026_CORREGIDO_SIN_CAPITULOS.docx";
const docxPath = process.argv[2] || defaultDocx;

function loadEnv(path = ".env.local") {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

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

function docxToText(file) {
  if (!existsSync(file)) throw new Error(`No existe el DOCX: ${file}`);
  const py = `import zipfile, sys\npath=sys.argv[1]\nwith zipfile.ZipFile(path) as z:\n    data=z.read('word/document.xml').decode('utf-8')\nsys.stdout.buffer.write(data.encode('utf-8'))`;
  const xml = execFileSync("python", ["-c", py, file], {
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
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

function findStarts(text) {
  const starts = [];
  const heading = /UNIDAD\s+TEM[ÁA]TICA\s+(\d{1,2})/gi;
  let match;
  while ((match = heading.exec(text))) {
    const number = Number(match[1]);
    const unit = units.find(([n]) => n === number);
    if (unit) starts.push({ number: unit[0], name: unit[1], idx: match.index });
  }
  return starts.sort((a, b) => a.idx - b.idx);
}

function headingOf(line) {
  const clean = line.replace(/\s+/g, " ").trim();
  if (/^(\d+(\.\d+)*[.)-]?\s*)?[A-ZÁÉÍÓÚÑ0-9 ,;:()/-]{8,}$/.test(clean))
    return clean;
  return null;
}

function splitChunks(content, unitNumber, unitName) {
  const blocks = content
    .split(/\n{2,}|(?=\n\d+(?:\.\d+)+\s+)/)
    .map((b) => b.trim())
    .filter(Boolean);
  const chunks = [];
  let current = [];
  let heading = null;
  function flush() {
    const text = current.join("\n\n").trim();
    if (!text) return;
    chunks.push({
      chunk_index: chunks.length,
      content: text,
      section: heading?.match(/^(\d+(?:\.\d+)*)/)?.[1] || null,
      section_name: heading || null,
      section_number: heading?.match(/^(\d+(?:\.\d+)*)/)?.[1] || null,
      section_title: heading || null,
      topic: heading || null,
      page: null,
      page_start: null,
      page_end: null,
      unit_number: unitNumber,
      unit_name: unitName,
      metadata: {
        strategy: "semantic-docx",
        generated: false,
        unit: unitNumber,
        unit_name: unitName,
      },
    });
    current = [];
  }
  for (const block of blocks) {
    const h = headingOf(block.split(/\n/)[0] || "");
    const len = current.join("\n\n").length;
    if (current.length && (len + block.length > 1500 || (h && len > 350)))
      flush();
    if (h) heading = h;
    if (block.length > 1700) {
      const sentences = block.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [block];
      for (const sentence of sentences) {
        if (current.join("\n\n").length + sentence.length > 1500) flush();
        current.push(sentence.trim());
      }
    } else current.push(block);
  }
  flush();
  return chunks;
}

function parseUnits(text) {
  const starts = findStarts(text);
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = starts[i + 1]?.idx ?? text.length;
    const content = text.slice(start.idx, end).trim();
    if (content.length < 100) continue;
    out.push({
      number: start.number,
      name: start.name,
      content,
      chunks: splitChunks(content, start.number, start.name),
    });
  }
  return out;
}

function reportFor(parsed) {
  const reports = parsed.map((u) => ({
    unitNumber: u.number,
    unitName: u.name,
    sections: new Set(u.chunks.map((c) => c.section_name).filter(Boolean)).size,
    chunks: u.chunks.length,
    words: u.content.split(/\s+/).filter(Boolean).length,
    pages: "sin página detectada",
    untitledChunks: u.chunks.filter((c) => !c.section_name).length,
    smallChunks: u.chunks.filter((c) => c.content.length < 250).length,
    largeChunks: u.chunks.filter((c) => c.content.length > 1800).length,
    issues: [],
  }));
  return {
    detectedUnits: parsed.length,
    expectedUnits: 15,
    units: reports,
    anomalies: units
      .filter(([n]) => !parsed.some((u) => u.number === n))
      .map(([n, name]) => `No se detectó Unidad ${n} - ${name}`),
  };
}

loadEnv();
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw new Error("Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");
const supabase = createClient(url, key, { auth: { persistSession: false } });
const text = docxToText(docxPath);
writeFileSync("docs/compendium-extracted.txt", text);
const parsed = parseUnits(text);
const report = reportFor(parsed);
for (const [number, name] of units) {
  await supabase
    .from("units")
    .upsert({ number, name, enabled: true }, { onConflict: "number" });
}
for (const unit of parsed) {
  const unitRes = await supabase
    .from("units")
    .select("id")
    .eq("number", unit.number)
    .single();
  if (unitRes.error) throw unitRes.error;
  const hash = createHash("sha256")
    .update(`2026\n${unit.content}`)
    .digest("hex");
  const existing = await supabase
    .from("documents")
    .select("id")
    .eq("unit_id", unitRes.data.id)
    .eq("content_hash", hash)
    .eq("active", true)
    .maybeSingle();
  if (existing.data?.id) continue;
  const doc = await supabase
    .from("documents")
    .insert({
      unit_id: unitRes.data.id,
      title: `Compendio FATESCIPOL 2026 · Unidad ${unit.number}`,
      source: "Compendio FATESCIPOL El Alto 2026",
      version: "2026",
      status: "processing",
      active: false,
      content_hash: hash,
      ingestion_report: report,
      original_filename: docxPath.split(/[\\/]/).pop(),
    })
    .select("id")
    .single();
  if (doc.error) throw doc.error;
  const rows = unit.chunks.map((c) => ({ ...c, document_id: doc.data.id }));
  for (let i = 0; i < rows.length; i += 100) {
    const ins = await supabase
      .from("document_chunks")
      .insert(rows.slice(i, i + 100));
    if (ins.error) throw ins.error;
  }
  const ready = await supabase
    .from("documents")
    .update({
      status: "ready",
      active: true,
      processed_at: new Date().toISOString(),
    })
    .eq("id", doc.data.id);
  if (ready.error) throw ready.error;
  await supabase
    .from("documents")
    .update({ active: false, superseded_by: doc.data.id })
    .eq("unit_id", unitRes.data.id)
    .neq("id", doc.data.id)
    .eq("active", true);
}
writeFileSync(
  "docs/ingestion-report-sprint5.json",
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    { report, chunks: parsed.reduce((sum, u) => sum + u.chunks.length, 0) },
    null,
    2,
  ),
);
