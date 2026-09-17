import "server-only";
import { createHash } from "node:crypto";

export type EmbeddingResult = {
  embedding: number[];
  model: string;
  contentHash: string;
};

type EmbeddingBody = {
  data?: Array<{ embedding?: number[] }>;
  model?: string;
  usage?: { total_tokens?: number };
};

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

export function normalizeForEmbedding(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function contentHash(text: string) {
  return createHash("sha256").update(normalizeForEmbedding(text)).digest("hex");
}

async function requestEmbeddings(texts: string[]) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no configurada.");
  const model = process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: texts.map(normalizeForEmbedding),
      dimensions: Number(
        process.env.OPENAI_EMBEDDING_DIMENSIONS ||
          DEFAULT_EMBEDDING_DIMENSIONS,
      ),
    }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`OpenAI embeddings falló: ${message.slice(0, 300)}`);
  }
  const body = (await response.json()) as EmbeddingBody;
  const embeddings = body.data?.map((item) => item.embedding || []) || [];
  if (embeddings.length !== texts.length || embeddings.some((item) => !item.length))
    throw new Error("OpenAI no devolvió embeddings completos.");
  return { model, embeddings };
}

export async function generateEmbedding(text: string): Promise<EmbeddingResult> {
  const normalized = normalizeForEmbedding(text);
  const { model, embeddings } = await requestEmbeddings([normalized]);
  return { embedding: embeddings[0], model, contentHash: contentHash(normalized) };
}

export async function generateEmbeddingsBatch(
  texts: string[],
): Promise<EmbeddingResult[]> {
  const normalized = texts.map(normalizeForEmbedding);
  if (!normalized.length) return [];
  const { model, embeddings } = await requestEmbeddings(normalized);
  return embeddings.map((embedding, index) => ({
    embedding,
    model,
    contentHash: contentHash(normalized[index]),
  }));
}
