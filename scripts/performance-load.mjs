#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import { performance } from "node:perf_hooks";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith("--")) {
    const key = arg.slice(2);
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i += 1;
    } else {
      args.set(key, "true");
    }
  }
}

const baseUrl = args.get("base-url") || process.env.PERFORMANCE_BASE_URL || "http://127.0.0.1:3010";
const token = args.get("token") || process.env.PERFORMANCE_TEST_TOKEN;
const scenario = args.get("scenario") || "mixed-simulated";
const vus = Number(args.get("vus") || 25);
const durationSeconds = Number(args.get("duration") || 60);
const delayMs = Number(args.get("delay-ms") || 250);
const payloadKb = Number(args.get("payload-kb") || 1);
const out = args.get("out") || `reports/performance/sprint22-${scenario}-${Date.now()}.json`;

if (!token) {
  console.error("Falta PERFORMANCE_TEST_TOKEN o --token. No se ejecuta la prueba.");
  process.exit(1);
}
if (!Number.isFinite(vus) || vus < 1 || vus > 500) throw new Error("vus debe estar entre 1 y 500");
if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600) throw new Error("duration debe estar entre 1 y 3600 segundos");

const latencies = [];
const statuses = new Map();
let completed = 0;
let failed = 0;
let inFlight = 0;
let maxInFlight = 0;
const startedAt = Date.now();
const stopAt = startedAt + durationSeconds * 1000;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function oneRequest() {
  const started = performance.now();
  inFlight += 1;
  maxInFlight = Math.max(maxInFlight, inFlight);
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/performance/simulate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Performance-Test-Token": token,
      },
      body: JSON.stringify({ scenario, delayMs, payloadKb }),
    });
    const elapsed = performance.now() - started;
    latencies.push(elapsed);
    statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
    if (!response.ok) failed += 1;
    completed += 1;
    await response.arrayBuffer().catch(() => undefined);
  } catch {
    const elapsed = performance.now() - started;
    latencies.push(elapsed);
    statuses.set("network_error", (statuses.get("network_error") || 0) + 1);
    failed += 1;
    completed += 1;
  } finally {
    inFlight -= 1;
  }
}

async function worker() {
  while (Date.now() < stopAt) {
    await oneRequest();
    const thinkTime = Math.max(0, Number(args.get("think-ms") || 750));
    if (thinkTime) await new Promise((resolve) => setTimeout(resolve, thinkTime));
  }
}

await Promise.all(Array.from({ length: vus }, () => worker()));
const elapsedSeconds = (Date.now() - startedAt) / 1000;
const result = {
  generatedAt: new Date().toISOString(),
  mode: "simulated-openai-free",
  baseUrl,
  scenario,
  vus,
  durationSeconds,
  completed,
  failed,
  errorRate: completed ? failed / completed : 0,
  requestsPerSecond: completed / elapsedSeconds,
  requestsPerMinute: (completed / elapsedSeconds) * 60,
  maxInFlight,
  latencyMs: {
    average: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    p50: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    p99: percentile(latencies, 99),
    min: latencies.length ? Math.min(...latencies) : 0,
    max: latencies.length ? Math.max(...latencies) : 0,
  },
  statuses: Object.fromEntries(statuses.entries()),
  notes: [
    "Esta prueba usa /api/performance/simulate y no valida calidad académica.",
    "No consume OpenAI real.",
    "No debe ejecutarse contra producción sin autorización.",
  ],
};
await mkdir(out.split(/[\\/]/).slice(0, -1).join("/") || ".", { recursive: true });
await writeFile(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
