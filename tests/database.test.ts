import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";

let db: PGlite;
const admin = "00000000-0000-4000-a000-000000000001";
const student = "00000000-0000-4000-a000-000000000002";
const other = "00000000-0000-4000-a000-000000000003";
const expired = "00000000-0000-4000-a000-000000000004";
const inactive = "00000000-0000-4000-a000-000000000005";
const future = "00000000-0000-4000-a000-000000000006";
const expiredAdmin = "00000000-0000-4000-a000-000000000007";
let unit: string;
let studentSession: string;
let simulation: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to authenticated;`);
  const migrationDir = new URL("../supabase/migrations/", import.meta.url);
  const migrations = (await readdir(migrationDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    await db.exec(await readFile(new URL(migration, migrationDir), "utf8"));
  }
  const users = [
    admin,
    student,
    other,
    expired,
    inactive,
    future,
    expiredAdmin,
  ];
  for (let i = 0; i < users.length; i++) {
    await db.query("insert into auth.users(id) values ($1)", [users[i]]);
    await db.query(
      `insert into public.profiles(id, username, full_name, role, status, starts_at, expires_at)
      values ($1, $2, 'Persona de prueba', $3::public.app_role, $4::public.account_status, $5, $6)`,
      [
        users[i],
        `user${i}`,
        [0, 6].includes(i) ? "ADMIN" : "ESTUDIANTE",
        i === 4 ? "inactive" : "active",
        i === 5 ? "2090-01-01" : "2020-01-01",
        [3, 6].includes(i) ? "2021-01-01" : "2099-01-01",
      ],
    );
  }
  unit = (
    await db.query<{ id: string }>("select id from units where number = 1")
  ).rows[0].id;
  for (const user of [student, other, expired, inactive, future]) {
    const s = await db.query<{ id: string }>(
      "insert into study_sessions(user_id, unit_id, mode) values ($1,$2,'text') returning id",
      [user, unit],
    );
    await db.query(
      "insert into messages(session_id, role, content) values ($1,'user','Pregunta de prueba')",
      [s.rows[0].id],
    );
    await db.query(
      "insert into usage_events(user_id, session_id, model, event_type) values ($1,$2,'test','chat')",
      [user, s.rows[0].id],
    );
    const sim = await db.query<{ id: string }>(
      "insert into simulations(user_id, unit_id) values ($1,$2) returning id",
      [user, unit],
    );
    await db.query(
      "insert into simulation_questions(simulation_id, position, question, question_type) values ($1,1,'Pregunta de prueba','conceptual')",
      [sim.rows[0].id],
    );
    await db.query(
      "insert into simulation_results(simulation_id, conceptual, terminology, application, argumentation, clarity, suggested_answer) values ($1,30,20,20,20,10,'Solo prueba SQL')",
      [sim.rows[0].id],
    );
    if (user === student) {
      studentSession = s.rows[0].id;
      simulation = sim.rows[0].id;
    }
  }
});
afterAll(async () => {
  await db.close();
});

async function asUser<T>(user: string, sql: string, params: unknown[] = []) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
    user,
  ]);
  await db.exec("set role authenticated");
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
  }
}

describe("Migración PostgreSQL y RLS real (auth.uid simulado)", () => {
  it("crea y habilita las 15 unidades oficiales", async () => {
    const rows = await asUser<{
      number: number;
      enabled: boolean;
      name: string;
    }>(student, "select * from units order by number");
    expect(rows).toHaveLength(15);
    expect(rows.filter((r) => r.enabled)).toHaveLength(15);
    expect(rows[0].name).toBe("Doctrina Policial");
  });
  it("activa RLS en todas las tablas académicas", async () => {
    const result = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(21);
    expect(result.rows.every((r) => r.relrowsecurity)).toBe(true);
  });
  it("un estudiante solo puede leer su perfil", async () => {
    const rows = await asUser<{ id: string }>(
      student,
      "select id from profiles",
    );
    expect(rows.map((r) => r.id)).toEqual([student]);
  });
  it("aísla sesiones, mensajes, consumo, simulacros, preguntas y resultados", async () => {
    for (const table of [
      "study_sessions",
      "messages",
      "usage_events",
      "simulations",
      "simulation_questions",
      "simulation_results",
    ]) {
      expect(await asUser(student, `select * from ${table}`)).toHaveLength(1);
    }
    expect(
      await asUser(other, "select * from study_sessions where id=$1", [
        studentSession,
      ]),
    ).toHaveLength(0);
  });
  it("administrador activo consulta toda la actividad", async () => {
    expect(await asUser(admin, "select * from profiles")).toHaveLength(7);
    expect(await asUser(admin, "select * from usage_events")).toHaveLength(5);
  });
  it.each([expired, inactive, future, expiredAdmin])(
    "bloquea material y actividad para cuenta sin vigencia %s",
    async (user) => {
      for (const table of [
        "units",
        "study_sessions",
        "messages",
        "simulations",
        "simulation_questions",
        "simulation_results",
        "usage_events",
      ]) {
        expect(await asUser(user, `select * from ${table}`)).toHaveLength(0);
      }
      expect(await asUser(user, "select * from profiles")).toHaveLength(1);
    },
  );
  it("impide autopromoción y extensión de acceso", async () => {
    await expect(
      asUser(student, "update profiles set role='ADMIN' where id=$1", [
        student,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(
        student,
        "update profiles set expires_at='2199-01-01' where id=$1",
        [student],
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("impide manipular métricas y notas desde cliente", async () => {
    await expect(
      asUser(
        student,
        "insert into usage_events(user_id,model,event_type) values ($1,'fake','chat')",
        [student],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(
        student,
        "update simulation_results set conceptual=30 where simulation_id=$1",
        [simulation],
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("bloquea limitador RPC a estudiantes y acceso anónimo", async () => {
    await expect(
      asUser(student, "select consume_rate_limit($1,3,60)", ["a".repeat(64)]),
    ).rejects.toThrow(/permission denied/);
    await db.exec("set role anon");
    try {
      await expect(db.query("select * from profiles")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  });
  it("limita intentos y renueva ventana expirada con clave de servicio", async () => {
    await db.exec("set role service_role");
    try {
      const bucket = "b".repeat(64);
      for (const expected of [true, true, false]) {
        expect(
          (
            await db.query<{ allowed: boolean }>(
              "select consume_rate_limit($1,2,60) as allowed",
              [bucket],
            )
          ).rows[0].allowed,
        ).toBe(expected);
      }
      await db.query(
        "update rate_limit_buckets set expires_at=now()-interval '1 second' where key=$1",
        [bucket],
      );
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select consume_rate_limit($1,2,60) as allowed",
            [bucket],
          )
        ).rows[0].allowed,
      ).toBe(true);
    } finally {
      await db.exec("reset role");
    }
  });
  it("solo publica documentos listos de unidades habilitadas", async () => {
    for (const status of ["pending", "ready"]) {
      const result = await db.query<{ id: string }>(
        "insert into documents(unit_id,title,source,status) values ($1,'Fixture','Test',$2) returning id",
        [unit, status],
      );
      await db.query(
        "insert into document_chunks(document_id,chunk_index,content) values ($1,0,'Fixture sin contenido académico')",
        [result.rows[0].id],
      );
    }
    expect(await asUser(student, "select * from documents")).toHaveLength(1);
    expect(await asUser(student, "select * from document_chunks")).toHaveLength(
      1,
    );
    expect(await asUser(admin, "select * from documents")).toHaveLength(2);
    expect(await asUser(expired, "select * from document_chunks")).toHaveLength(
      0,
    );
  });
  it("crea columna e índice de búsqueda para RAG textual", async () => {
    const columns = await db.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema='public' and table_name='document_chunks' and column_name='search_vector'",
    );
    expect(columns.rows).toHaveLength(1);
    const indexes = await db.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname='public' and tablename='document_chunks' and indexname='document_chunks_search_idx'",
    );
    expect(indexes.rows).toHaveLength(1);
  });
  it("valida rúbrica y calcula total en base de datos", async () => {
    expect(
      (
        await db.query<{ total: number }>(
          "select total from simulation_results where simulation_id=$1",
          [simulation],
        )
      ).rows[0].total,
    ).toBe(100);
    await expect(
      db.query(
        "update simulation_results set conceptual=31 where simulation_id=$1",
        [simulation],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query("update usage_events set input_tokens=-1"),
    ).rejects.toThrow(/check constraint/);
  });
  it("usuario Auth sin perfil no recibe acceso por defecto", async () => {
    const id = "00000000-0000-4000-a000-000000000099";
    await db.query("insert into auth.users(id) values ($1)", [id]);
    expect(await asUser(id, "select * from units")).toHaveLength(0);
    expect(await asUser(id, "select * from profiles")).toHaveLength(0);
  });
});
