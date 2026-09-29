import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_PRODUCT_ID } from "@/lib/products/products";
import { OFFICIAL_UNITS } from "@/lib/units";
import { requireAdmin, requireProfile } from "@/lib/auth/session";
import { accessProblem } from "@/lib/auth/rules";
import { periodStart, summarizeUsage } from "@/lib/metrics";
import type { DocumentSummary, Profile, Unit, UsageEvent } from "@/lib/models";

export type UnitProgressSummary = Unit & {
  status?: string;
  progress: number;
  topics: string[];
  chunks: number;
};

export async function getUnits(): Promise<Unit[]> {
  await requireProfile();
  const db = await createSupabaseServer();
  const { data, error } = await db
    .from("units")
    .select("id,number,name,enabled")
    .order("number");
  if (error) throw new Error("No se pudieron cargar las unidades.");
  return data as Unit[];
}

export async function getUnitByNumber(number: number, productId?: string | null): Promise<Unit> {
  await requireProfile();
  if (productId) {
    const dbAdmin = createSupabaseAdmin();
    let query = dbAdmin
      .from("academic_units")
      .select("id,unit_number,unit_name")
      .eq("unit_number", number)
      .eq("product_id", productId)
      .order("created_at", { ascending: false });
    const { data, error } = await query.limit(1);
    if (!error && data?.length) {
      const row = data[0];
      const unit = {
        id: String(row.id),
        number: Number(row.unit_number),
        name: String(row.unit_name || `Unidad ${row.unit_number}`),
        enabled: true,
      } as Unit;
      const chunks = await getCourseChunkRows(productId);
      return { ...unit, name: displayNameForCourseUnit(unit, chunks, productId) };
    }
  }
  const db = await createSupabaseServer();
  const { data, error } = await db
    .from("units")
    .select("id,number,name,enabled")
    .eq("number", number)
    .single();
  if (error || !data) throw new Error("No se pudo cargar la unidad.");
  return data as Unit;
}

function isMissingProductColumn(error: { message?: string; code?: string } | null | undefined) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("product_id") || message.includes("schema cache") || message.includes("does not exist");
}

async function getLegacyChunkRows(productId?: string | null): Promise<UnitTopicRow[]> {
  const db = createSupabaseAdmin();
  let query = db
    .from("document_chunks")
    .select("unit_number,topic,section_name,section_title,section,content");
  if (productId) query = query.eq("product_id", productId);
  const { data, error } = await query.limit(2500);
  if (error && productId && isMissingProductColumn(error)) {
    const fallback = await db
      .from("document_chunks")
      .select("unit_number,topic,section_name,section_title,section,content")
      .limit(2500);
    if (fallback.error) return [];
    return (fallback.data || []) as UnitTopicRow[];
  }
  if (error) return [];
  return (data || []) as UnitTopicRow[];
}

type KnowledgeChunkTopicRow = {
  content?: string | null;
  source_content?: string | null;
  metadata?: Record<string, unknown> | null;
  academic_units?: { unit_number?: number | null; unit_name?: string | null } | Array<{ unit_number?: number | null; unit_name?: string | null }> | null;
  academic_topics?: { topic_number?: string | null; topic_name?: string | null } | Array<{ topic_number?: string | null; topic_name?: string | null }> | null;
};

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

async function getKnowledgeChunkRows(productId?: string | null): Promise<UnitTopicRow[]> {
  const db = createSupabaseAdmin();
  let query = db
    .from("knowledge_chunks")
    .select("content,source_content,metadata,academic_units(unit_number,unit_name),academic_topics(topic_number,topic_name)");
  if (productId) query = query.eq("product_id", productId);
  const { data, error } = await query.limit(2500);
  if (error) return [];
  return ((data || []) as KnowledgeChunkTopicRow[]).map((row) => {
    const unit = firstRelation(row.academic_units);
    const topic = firstRelation(row.academic_topics);
    const metadata = row.metadata || {};
    return {
      unit_number: Number(unit?.unit_number || metadata.unit_number || 0),
      topic: String(topic?.topic_name || metadata.topic_name || ""),
      section_name: String(metadata.section_name || topic?.topic_name || ""),
      section_title: String(topic?.topic_name || metadata.topic_name || ""),
      section: String(topic?.topic_number || metadata.topic_number || metadata.section_number || "") || null,
      content: row.source_content || row.content || null,
    };
  });
}

async function getCourseChunkRows(productId?: string | null) {
  const [legacy, knowledge] = await Promise.all([
    getLegacyChunkRows(productId),
    getKnowledgeChunkRows(productId),
  ]);
  return [...legacy, ...knowledge];
}

function firstTopicNameForUnit(chunks: UnitTopicRow[], unitNumber: number) {
  for (const chunk of chunks) {
    if (Number(chunk.unit_number) !== unitNumber) continue;
    const name = getTopicName(chunk);
    if (name && name.length > 3 && !isUnitHeadingTopic(name)) return name;
  }
  return null;
}

function isOfficialFatescipolUnitName(value: string) {
  const normalized = normalizeTopicText(value).toLowerCase();
  return OFFICIAL_UNITS.some((unit) => normalizeTopicText(unit.name).toLowerCase() === normalized);
}

function displayNameForCourseUnit(unit: Unit, chunks: UnitTopicRow[], productId?: string | null) {
  if (!productId || productId === DEFAULT_PRODUCT_ID) return unit.name;
  const detected = firstTopicNameForUnit(chunks, unit.number);
  if (!detected) return unit.name;
  if (!unit.name || /^unidad\s+\d+$/i.test(unit.name) || isOfficialFatescipolUnitName(unit.name)) return detected;
  return unit.name;
}

type AcademicUnitRow = {
  id: string;
  unit_number: number;
  unit_name: string | null;
  product_id?: string | null;
};

async function getAcademicUnitsForProduct(productId?: string | null): Promise<Unit[]> {
  if (!productId) return [];
  const { data, error } = await createSupabaseAdmin()
    .from("academic_units")
    .select("id,unit_number,unit_name,product_id")
    .eq("product_id", productId)
    .order("unit_number", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return [];
  const byNumber = new Map<number, Unit>();
  for (const row of (data || []) as AcademicUnitRow[]) {
    const number = Number(row.unit_number || 0);
    if (!number || byNumber.has(number)) continue;
    byNumber.set(number, {
      id: String(row.id),
      number,
      name: String(row.unit_name || `Unidad ${number}`),
      enabled: true,
    } as Unit);
  }
  return [...byNumber.values()].sort((a, b) => a.number - b.number);
}

export async function getUnitsWithProgress(productId?: string | null): Promise<UnitProgressSummary[]> {
  const profile = await requireProfile();
  const db = await createSupabaseServer();
  let progressQuery = db
    .from("unit_progress")
    .select(
      "unit_id,status,study_sessions,questions_asked,practices,simulations,average_score",
    )
    .eq("user_id", profile.id);
  if (productId) progressQuery = progressQuery.eq("product_id", productId);
  const [legacyUnitsResult, academicUnits, progressResult, chunks] =
    await Promise.all([
      db.from("units").select("id,number,name,enabled").order("number"),
      getAcademicUnitsForProduct(productId),
      progressQuery,
      getCourseChunkRows(productId),
    ]);
  if (legacyUnitsResult.error || !legacyUnitsResult.data) throw new Error("No se pudieron cargar las unidades.");
  const chunkUnitNumbers = [...new Set((chunks || []).map((chunk) => Number(chunk.unit_number)).filter(Boolean))].sort((a, b) => a - b);
  const synthesizedUnits = chunkUnitNumbers.map((number) => ({
    id: `product-${productId || "default"}-unit-${number}`,
    number,
    name: firstTopicNameForUnit(chunks || [], number) || `Unidad ${number}`,
    enabled: true,
  }) as Unit);
  const units = academicUnits.length
    ? academicUnits
    : productId && productId !== DEFAULT_PRODUCT_ID && synthesizedUnits.length
      ? synthesizedUnits
      : (legacyUnitsResult.data as Unit[]);
  const progress = progressResult.error && productId && isMissingProductColumn(progressResult.error)
    ? []
    : progressResult.data || [];
  const progressByUnit = new Map(
    (progress || []).map((row) => [row.unit_id, row]),
  );
  const chunkMap = new Map<number, { count: number; topics: Set<string> }>();
  for (const chunk of chunks || []) {
    const number = Number(chunk.unit_number);
    if (!number) continue;
    const entry = chunkMap.get(number) || {
      count: 0,
      topics: new Set<string>(),
    };
    entry.count += 1;
    const topic = chunk.topic || chunk.section_title || chunk.section_name;
    if (topic) entry.topics.add(String(topic));
    chunkMap.set(number, entry);
  }
  return units.map((unit) => {
    const p = progressByUnit.get(unit.id) as
      Record<string, number | string | null> | undefined;
    const activity =
      Number(p?.study_sessions || 0) +
      Number(p?.questions_asked || 0) +
      Number(p?.practices || 0) +
      Number(p?.simulations || 0) * 2;
    const score = Number(p?.average_score || 0);
    const calculated = Math.min(100, Math.round(activity * 8 + score * 0.3));
    const chunkInfo = chunkMap.get(unit.number);
    return {
      ...unit,
      name: displayNameForCourseUnit(unit, chunks || [], productId),
      status: String(p?.status || "sin_iniciar"),
      progress: calculated,
      topics: [...(chunkInfo?.topics || new Set<string>())].slice(0, 8),
      chunks: chunkInfo?.count || 0,
    };
  });
}

type UnitTopicRow = {
  unit_number?: number | null;
  topic: string | null;
  section_name: string | null;
  section_title: string | null;
  section: string | null;
  content: string | null;
};

export type UnitTopicSummary = {
  section: string | null;
  name: string;
  count: number;
};

function normalizeTopicText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUnitHeadingTopic(name: string) {
  const normalized = normalizeTopicText(name).toLowerCase();
  return /^unidad\s+tematica\b/.test(normalized);
}

function sectionSortParts(value: string | null) {
  const match = String(value || "").match(/\d+(?:\.\d+)*/);
  if (!match) return [];
  return match[0].split(".").map((part) => Number(part));
}

function compareSections(a: string | null, b: string | null) {
  const aParts = sectionSortParts(a);
  const bParts = sectionSortParts(b);
  if (!aParts.length && !bParts.length) return 0;
  if (!aParts.length) return 1;
  if (!bParts.length) return -1;
  const length = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (aParts[index] || 0) - (bParts[index] || 0);
    if (diff) return diff;
  }
  return 0;
}

function getTopicName(chunk: UnitTopicRow) {
  return String(
    chunk.section_title ||
      chunk.section_name ||
      chunk.topic ||
      chunk.content?.split("\n").find((line) => line.trim().length > 3) ||
      "Tema sin título",
  )
    .replace(/^\d+(?:\.\d+)*\s*[.-]?\s*/, "")
    .trim();
}

export async function getUnitTopics(
  unitNumber: number,
  productId?: string | null,
): Promise<UnitTopicSummary[]> {
  await requireProfile();
  const data = (await getCourseChunkRows(productId)).filter(
    (chunk) => Number(chunk.unit_number) === unitNumber,
  );

  const topics = new Map<string, UnitTopicSummary>();
  for (const chunk of (data || []) as UnitTopicRow[]) {
    const name = getTopicName(chunk);
    if (!name || name.length < 4 || isUnitHeadingTopic(name)) continue;
    const section = String(chunk.section || "").trim() || null;
    const key = `${section || "sin-seccion"}::${normalizeTopicText(name).toLowerCase()}`;
    const current = topics.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    topics.set(key, { section, name, count: 1 });
  }

  return [...topics.values()]
    .sort(
      (a, b) =>
        compareSections(a.section, b.section) ||
        a.name.localeCompare(b.name, "es", { numeric: true }),
    )
    .slice(0, 120);
}

export async function getWeakTopics(userId?: string) {
  const profile = await requireProfile();
  const target = userId || profile.id;
  const db = await createSupabaseServer();
  const [{ data: progress }, { data: results }] = await Promise.all([
    db.from("unit_progress").select("weak_topics").eq("user_id", target),
    db
      .from("simulation_results")
      .select("concepts_omitted,review_topics,simulation_id"),
  ]);
  const topics = new Map<string, number>();
  for (const row of progress || []) {
    for (const topic of row.weak_topics || [])
      topics.set(topic, (topics.get(topic) || 0) + 2);
  }
  for (const row of results || []) {
    for (const topic of [
      ...(row.concepts_omitted || []),
      ...(row.review_topics || []),
    ]) {
      topics.set(topic, (topics.get(topic) || 0) + 1);
    }
  }
  return [...topics.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic]) => topic);
}

export async function getStudentStats() {
  const profile = await requireProfile();
  const db = await createSupabaseServer();
  const [sessions, simulations, documents, practices, progress, weakTopics] =
    await Promise.all([
      db
        .from("study_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .in("mode", ["text", "voice"]),
      db
        .from("simulations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("status", "completed"),
      db
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("status", "ready")
        .eq("active", true),
      db
        .from("practice_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id),
      db
        .from("unit_progress")
        .select("unit_id,status")
        .eq("user_id", profile.id),
      getWeakTopics(profile.id),
    ]);
  if (
    sessions.error ||
    simulations.error ||
    documents.error ||
    practices.error ||
    progress.error
  )
    throw new Error("No se pudo consultar la actividad.");
  return {
    conversations: sessions.count ?? 0,
    simulations: simulations.count ?? 0,
    documents: documents.count ?? 0,
    practices: practices.count ?? 0,
    unitsStudied: (progress.data || []).filter(
      (row) => row.status !== "sin_iniciar",
    ).length,
    weakTopics,
  };
}

export async function getAdminData(period: string, userId?: string) {
  await requireAdmin();
  const db = await createSupabaseServer();
  const profiles: Profile[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + 499);
    if (error) throw new Error("No se pudieron consultar los usuarios.");
    profiles.push(...(data as Profile[]));
    if (data.length < 500) break;
  }
  const since = periodStart(period);
  const usage: UsageEvent[] = [];
  for (let from = 0; ; from += 500) {
    let query = db
      .from("usage_events")
      .select(
        "user_id,input_tokens,output_tokens,audio_input,audio_output,estimated_cost",
      )
      .gte("created_at", since)
      .order("created_at")
      .order("id")
      .range(from, from + 499);
    if (userId) query = query.eq("user_id", userId);
    const { data, error } = await query;
    if (error) throw new Error("No se pudo consultar el consumo.");
    usage.push(...(data as UsageEvent[]));
    if (data.length < 500) break;
  }
  let sessionsQuery = db
    .from("study_sessions")
    .select("id", { count: "exact", head: true })
    .gte("started_at", since)
    .in("mode", ["text", "voice"]);
  let simulationsQuery = db
    .from("simulations")
    .select("id", { count: "exact", head: true })
    .gte("started_at", since)
    .eq("status", "completed");
  if (userId) {
    sessionsQuery = sessionsQuery.eq("user_id", userId);
    simulationsQuery = simulationsQuery.eq("user_id", userId);
  }
  const [sessions, simulations] = await Promise.all([
    sessionsQuery,
    simulationsQuery,
  ]);
  if (sessions.error || simulations.error)
    throw new Error("No se pudo consultar la actividad.");
  const [documents, chunks, unitsReady] = await Promise.all([
    db
      .from("documents")
      .select(
        "id,title,source,version,status,created_at,ingestion_report,processed_at",
      )
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(20),
    db.from("document_chunks").select("id", { count: "exact", head: true }),
    db
      .from("documents")
      .select("unit_id", { count: "exact", head: true })
      .eq("active", true)
      .eq("status", "ready"),
  ]);
  if (documents.error || chunks.error || unitsReady.error)
    throw new Error("No se pudo consultar el compendio.");
  const students = profiles.filter(
    (p) => p.role === "ESTUDIANTE" && (!userId || p.id === userId),
  );
  const latestReport = (documents.data?.[0]?.ingestion_report ||
    null) as unknown;
  return {
    profiles,
    documents: (documents.data || []) as DocumentSummary[],
    chunkCount: chunks.count ?? 0,
    unitsReady: unitsReady.count ?? 0,
    ingestionReport: latestReport,
    referenceTime: Date.now(),
    active: profiles.filter((p) => !accessProblem(p)).length,
    conversations: sessions.count ?? 0,
    simulations: simulations.count ?? 0,
    usage: summarizeUsage(
      usage,
      students.map((p) => p.id),
    ),
    eventCount: usage.length,
  };
}
