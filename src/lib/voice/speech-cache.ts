import "server-only";
import { createHash } from "node:crypto";

export type CachedSpeech = {
  audio: ArrayBuffer;
  contentType: string;
  model: string;
  outputSeconds: number;
  createdAt: number;
};

const speechCache = new Map<string, CachedSpeech>();
const speechCacheTtlMs =
  Number(process.env.VOICE_CACHE_TTL_SECONDS || 900) * 1000;
const maxCachedSpeechItems = Number(process.env.VOICE_CACHE_MAX_ITEMS || 80);

export function cacheKeyForSpeech(parts: Array<string | null | undefined>) {
  return createHash("sha256")
    .update(parts.filter(Boolean).join(":"))
    .digest("hex");
}

export function getCachedSpeech(key: string) {
  const cached = speechCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > speechCacheTtlMs) {
    speechCache.delete(key);
    return null;
  }
  return cached;
}

export function rememberSpeech(key: string, value: CachedSpeech) {
  if (speechCache.size >= maxCachedSpeechItems) {
    const oldestKey = speechCache.keys().next().value;
    if (oldestKey) speechCache.delete(oldestKey);
  }
  speechCache.set(key, value);
}

export function cachedSpeechResponse(cached: CachedSpeech) {
  return new Response(cached.audio.slice(0), {
    headers: {
      "Content-Type": cached.contentType,
      "Cache-Control": "private, max-age=900",
      "X-Audio-Seconds": String(cached.outputSeconds),
      "X-OpenAI-Model": cached.model,
      "X-Voice-Cache": "HIT",
    },
  });
}
