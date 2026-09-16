import { OFFICIAL_UNITS, unitName } from "@/lib/units";
import { splitDocument, type ChunkInput } from "@/lib/rag/chunk";

export type ParsedUnit = {
  unitNumber: number;
  unitName: string;
  content: string;
  headings: string[];
  chunks: ChunkInput[];
};

export type IngestionUnitReport = {
  unitNumber: number;
  unitName: string;
  sections: number;
  chunks: number;
  words: number;
  pages: string;
  untitledChunks: number;
  smallChunks: number;
  largeChunks: number;
  issues: string[];
};

export type IngestionReport = {
  detectedUnits: number;
  expectedUnits: number;
  units: IngestionUnitReport[];
  anomalies: string[];
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unitRegex(unit: { number: number; name: string }) {
  const words = normalize(unit.name)
    .split(" ")
    .filter((word) => word.length > 3)
    .slice(0, 6)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const namePart = words.join("[\\s\\S]{0,80}");
  return new RegExp(
    `(?:unidad\\s*(?:tem[aá]tica)?\\s*)?${unit.number}(?:\\D{0,80}${namePart})`,
    "i",
  );
}

function findUnitStarts(text: string) {
  const normalizedText = normalize(text);
  return OFFICIAL_UNITS.map((unit) => {
    const name = normalize(unit.name);
    const direct = normalizedText.indexOf(name);
    const regexMatch = text.match(unitRegex(unit));
    const regexIndex = regexMatch?.index ?? -1;
    let index = direct >= 0 ? direct : regexIndex;
    if (direct >= 0) {
      const rawPrefix = text.slice(0, Math.min(text.length, direct + 1));
      index = rawPrefix.length - 1;
    }
    return { unit, index };
  })
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
}

function extractHeadings(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      /^(\d+(?:\.\d+)*\s+)?[A-ZÁÉÍÓÚÑ0-9 ,;:()/-]{8,}$/.test(line),
    )
    .slice(0, 80);
}

export function parseFullCompendium(text: string): ParsedUnit[] {
  const starts = findUnitStarts(text);
  const byNumber = new Map<number, ParsedUnit>();
  for (let index = 0; index < starts.length; index += 1) {
    const current = starts[index];
    const next = starts[index + 1];
    const content = text
      .slice(current.index, next?.index ?? text.length)
      .trim();
    if (content.length < 120) continue;
    const chunks = splitDocument(content).map((chunk) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        unit: current.unit.number,
        unit_name: current.unit.name,
      },
    }));
    byNumber.set(current.unit.number, {
      unitNumber: current.unit.number,
      unitName: current.unit.name,
      content,
      headings: extractHeadings(content),
      chunks,
    });
  }
  return OFFICIAL_UNITS.map((unit) => byNumber.get(unit.number)).filter(
    (unit): unit is ParsedUnit => Boolean(unit),
  );
}

export function buildIngestionReport(units: ParsedUnit[]): IngestionReport {
  const detected = new Set(units.map((unit) => unit.unitNumber));
  const anomalies: string[] = [];
  for (const unit of OFFICIAL_UNITS) {
    if (!detected.has(unit.number))
      anomalies.push(`No se detectó Unidad ${unit.number} - ${unit.name}.`);
  }
  const reports = units.map((unit) => {
    const words = unit.content.split(/\s+/).filter(Boolean).length;
    const pages = unit.chunks
      .map((chunk) => chunk.page)
      .filter((page): page is number => Number.isFinite(page));
    const untitledChunks = unit.chunks.filter(
      (chunk) => !chunk.section_name && !chunk.topic,
    ).length;
    const smallChunks = unit.chunks.filter(
      (chunk) => chunk.content.length < 250,
    ).length;
    const largeChunks = unit.chunks.filter(
      (chunk) => chunk.content.length > 1800,
    ).length;
    const issues: string[] = [];
    if (unit.chunks.length === 0) issues.push("Sin chunks generados.");
    if (untitledChunks > Math.max(3, unit.chunks.length * 0.35))
      issues.push("Alta cantidad de chunks sin título detectado.");
    if (smallChunks > 0)
      issues.push(`${smallChunks} chunks demasiado pequeños.`);
    if (largeChunks > 0)
      issues.push(`${largeChunks} chunks demasiado grandes.`);
    return {
      unitNumber: unit.unitNumber,
      unitName: unit.unitName,
      sections: new Set(unit.headings).size,
      chunks: unit.chunks.length,
      words,
      pages: pages.length
        ? `${Math.min(...pages)}-${Math.max(...pages)}`
        : "sin página detectada",
      untitledChunks,
      smallChunks,
      largeChunks,
      issues,
    };
  });
  const duplicateTitles = new Map<string, number>();
  for (const unit of units) {
    for (const heading of unit.headings)
      duplicateTitles.set(heading, (duplicateTitles.get(heading) || 0) + 1);
  }
  for (const [heading, count] of duplicateTitles) {
    if (count > 3)
      anomalies.push(`Título repetido en varias unidades: ${heading}`);
  }
  return {
    detectedUnits: units.length,
    expectedUnits: 15,
    units: reports,
    anomalies,
  };
}

export function fallbackUnit(number: number): ParsedUnit {
  const name = unitName(number);
  const content = `UNIDAD ${number}\n${name}\nContenido pendiente de verificación durante la ingesta completa del compendio.`;
  return {
    unitNumber: number,
    unitName: name,
    content,
    headings: [name],
    chunks: splitDocument(content),
  };
}
