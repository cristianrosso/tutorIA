export type ChunkInput = {
  content: string;
  chunk_index: number;
  section: string | null;
  section_name: string | null;
  topic: string | null;
  page: number | null;
  metadata: Record<string, string | number | boolean | null>;
};

const maxChunkChars = 1200;
const minChunkChars = 350;

function cleanLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function readHeading(block: string) {
  const firstLine = cleanLine(block.split(/\r?\n/)[0] || "");
  const match = firstLine.match(
    /^(?:(\d+(?:\.\d+)*)[\s).-]+)?([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ,;:()/-]{4,})$/,
  );
  if (!match) return null;
  return {
    section: match[1] || null,
    section_name: cleanLine(match[2] || firstLine),
  };
}

function readPage(block: string) {
  const match = block.match(/\b(?:p[aá]gina|pag\.?)\s*(\d{1,4})\b/i);
  return match ? Number(match[1]) : null;
}

export function splitDocument(content: string): ChunkInput[] {
  const normalized = content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  if (normalized.length < 80) return [];
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const chunks: ChunkInput[] = [];
  let current: string[] = [];
  let currentHeading: ReturnType<typeof readHeading> = null;
  let currentPage: number | null = null;

  function flush() {
    const text = current.join("\n\n").trim();
    if (!text) return;
    chunks.push({
      content: text,
      chunk_index: chunks.length,
      section: currentHeading?.section ?? null,
      section_name: currentHeading?.section_name ?? null,
      topic: currentHeading?.section_name ?? null,
      page: currentPage,
      metadata: { strategy: "semantic-paragraphs", generated: false },
    });
    current = [];
    currentHeading = null;
    currentPage = null;
  }

  for (const block of blocks) {
    const heading = readHeading(block);
    const page = readPage(block);
    const currentLength = current.join("\n\n").length;
    if (
      current.length > 0 &&
      (currentLength + block.length > maxChunkChars ||
        (heading && currentLength >= minChunkChars))
    ) {
      flush();
    }
    if (!currentHeading && heading) currentHeading = heading;
    if (!currentPage && page) currentPage = page;
    if (block.length > maxChunkChars) {
      const sentences = block.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [block];
      for (const sentence of sentences) {
        const pendingLength = current.join("\n\n").length;
        if (pendingLength + sentence.length > maxChunkChars) flush();
        current.push(cleanLine(sentence));
      }
    } else {
      current.push(block);
    }
  }
  flush();
  return chunks;
}

export function normalizeQuery(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const stopWords = new Set([
  "como",
  "cual",
  "cuando",
  "dame",
  "del",
  "desde",
  "donde",
  "el",
  "ella",
  "ellos",
  "en",
  "es",
  "esta",
  "este",
  "esto",
  "la",
  "las",
  "lo",
  "los",
  "para",
  "por",
  "que",
  "segun",
  "un",
  "una",
  "y",
]);

export function tokenize(value: string) {
  return normalizeQuery(value)
    .split(" ")
    .filter((token) => token.length > 2 && !stopWords.has(token));
}
