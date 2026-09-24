#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.name === "route.ts") files.push(full);
  }
  return files;
}

const apiRoot = path.join(process.cwd(), "src", "app", "api");
const files = await walk(apiRoot);
const endpoints = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  const methods = [...source.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)/g)].map((m) => m[1]);
  const route = "/api/" + path.relative(apiRoot, path.dirname(file)).replace(/\\/g, "/").replace(/\[([^\]]+)\]/g, ":$1");
  const category = route.includes("voice") ? "voice" : route.includes("admin") ? "admin" : route.includes("analytics") ? "analytics" : route.includes("assessment") || route.includes("exams") ? "evaluation" : route.includes("tutor") || route.includes("knowledge") ? "rag_ai" : "application";
  endpoints.push({ route, methods, category, hasRateLimit: source.includes("consumeLimit("), usesOpenAI: /generateTutorText|transcribeAudio|synthesizeSpeech|generateSpeechAudio/.test(source), usesSupabaseAdmin: source.includes("createSupabaseAdmin") });
}
endpoints.sort((a, b) => a.route.localeCompare(b.route));
await mkdir("docs/performance", { recursive: true });
await writeFile("docs/performance/sprint22-endpoints.json", JSON.stringify({ generatedAt: new Date().toISOString(), endpoints }, null, 2));
console.log(`Inventario generado: ${endpoints.length} endpoints`);
