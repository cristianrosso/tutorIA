// Servidor de contratos para pruebas, NO es Supabase ni se incluye en la app.
// Las políticas SQL se verifican separadamente ejecutándolas en PostgreSQL/PGlite.
import http from "node:http";
import { createHmac } from "node:crypto";

const fixtures = [
  {
    id: "00000000-0000-4000-a000-000000000001",
    username: "admin.test",
    full_name: "Administración de prueba",
    role: "ADMIN",
    status: "active",
  },
  {
    id: "00000000-0000-4000-a000-000000000002",
    username: "student.test",
    full_name: "Estudiante de prueba",
    role: "ESTUDIANTE",
    status: "active",
  },
  {
    id: "00000000-0000-4000-a000-000000000003",
    username: "inactive.test",
    full_name: "Cuenta inactiva de prueba",
    role: "ESTUDIANTE",
    status: "inactive",
  },
].map((p) => ({
  ...p,
  starts_at: "2020-01-01T00:00:00Z",
  expires_at: "2099-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
}));
const users = fixtures.map((p) => ({
  id: p.id,
  aud: "authenticated",
  role: "authenticated",
  email: `${p.username}@test.invalid`,
  email_confirmed_at: "2026-01-01T00:00:00Z",
  phone: "",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
}));
function token(user) {
  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const payload = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}`;
  return `${payload}.${createHmac("sha256", "test-fixture-signature-not-a-real-key").update(payload).digest("base64url")}`;
}
function currentUser(req) {
  try {
    const claims = JSON.parse(
      Buffer.from(
        (req.headers.authorization || "").split(".")[1],
        "base64url",
      ).toString(),
    );
    return users.find((u) => u.id === claims.sub);
  } catch {
    return undefined;
  }
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:54329");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString())
    : {};
  const send = (status, data, count) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      ...(count !== undefined ? { "Content-Range": `*/${count}` } : {}),
    });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(data));
  };
  if (url.pathname === "/health") return send(200, { ok: true });
  if (url.pathname === "/auth/v1/token") {
    const user = users.find((u) => u.email === body.email);
    if (!user || body.password !== "fixture-password-2026")
      return send(400, {
        code: "invalid_credentials",
        msg: "Invalid login credentials",
      });
    return send(200, {
      access_token: token(user),
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `fixture-${user.id}`,
      user,
    });
  }
  if (url.pathname === "/auth/v1/user") {
    const user = currentUser(req);
    return send(user ? 200 : 401, user || { msg: "No session" });
  }
  if (url.pathname === "/auth/v1/logout") return send(200, {});
  if (url.pathname === "/rest/v1/rpc/consume_rate_limit")
    return send(200, true);
  const user = currentUser(req);
  if (!user) return send(401, { message: "No session" });
  const profile = fixtures.find((p) => p.id === user.id);
  if (url.pathname === "/rest/v1/profiles") {
    let rows = profile.role === "ADMIN" ? fixtures : [profile];
    if (url.searchParams.has("id"))
      rows = rows.filter((p) => `eq.${p.id}` === url.searchParams.get("id"));
    return send(
      200,
      req.headers.accept?.includes("vnd.pgrst.object") ? rows[0] : rows,
      rows.length,
    );
  }
  if (url.pathname === "/rest/v1/units")
    return send(
      200,
      Array.from({ length: 15 }, (_, i) => ({
        id: `unit-${i + 1}`,
        number: i + 1,
        name: i === 0 ? "Doctrina Policial" : `Unidad temática ${i + 1}`,
        enabled: i === 0,
      })),
    );
  if (
    ["study_sessions", "simulations", "documents", "usage_events"].some(
      (t) => url.pathname === `/rest/v1/${t}`,
    )
  )
    return send(200, [], 0);
  send(404, { message: "Contrato de test no implementado" });
});
server.listen(54329, "127.0.0.1", () =>
  console.log("Fixture Supabase: http://127.0.0.1:54329"),
);
