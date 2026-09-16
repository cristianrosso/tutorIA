import { spawn, spawnSync } from "node:child_process";
import {
  createWriteStream,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const project = "tutor-ia-fatescipol";
const network = "tutor-ia-fatescipol-local";
const cli = join(root, "node_modules", "supabase", "dist", "supabase.js");
const exposedContainers = [
  "supabase_db_tutor-ia-fatescipol",
  "supabase_kong_tutor-ia-fatescipol",
  "supabase_studio_tutor-ia-fatescipol",
];
const action = process.argv[2];
if (!["start", "stop", "env", "status"].includes(action))
  throw new Error("Usa start, stop, env o status.");
const config = readFileSync(join(root, "supabase", "config.toml"), "utf8");
if (!config.includes(`project_id = "${project}"`))
  throw new Error(
    "El identificador del tutor no coincide; operación cancelada.",
  );
if (/\b(?:port|shadow_port|inspector_port)\s*=\s*(?!5643\d\b)\d+/.test(config))
  throw new Error("Puerto fuera del rango exclusivo 56430–56439.");

function runCli(args) {
  const result = spawnSync(
    process.execPath,
    [cli, ...args, "--workdir", root, "--agent", "no"],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(
      `Supabase no pudo ejecutar ${args[0]}. Revisa que esté iniciado el stack del tutor.`,
    );
  return result.stdout;
}
function getStatus() {
  return JSON.parse(runCli(["status", "-o", "json"]));
}
function verifyPublishedPorts() {
  const inspect = spawnSync(
    "docker",
    [
      "inspect",
      ...exposedContainers,
      "--format",
      "{{json .NetworkSettings.Ports}}",
    ],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    },
  );
  if (inspect.status !== 0) return;
  const bindings = inspect.stdout
    .trim()
    .split(/\r?\n/)
    .flatMap((line) => Object.values(JSON.parse(line)).flat())
    .filter(Boolean);
  const publicBindings = bindings.filter(
    (item) => !["127.0.0.1", "::1"].includes(item.HostIp),
  );
  if (publicBindings.length > 0)
    console.warn(
      "Docker publicó puertos del tutor con HostIp amplio. Se conservan puertos exclusivos 56430–56439; no se tocará configuración global.",
    );
}
function syncEnv() {
  const status = getStatus();
  const url = status.API_URL ?? status.api?.url;
  const publicKey =
    status.PUBLISHABLE_KEY ??
    status.ANON_KEY ??
    status.api?.publishable_key ??
    status.api?.anon_key;
  const secretKey =
    status.SECRET_KEY ??
    status.SERVICE_ROLE_KEY ??
    status.api?.secret_key ??
    status.api?.service_role_key;
  if (!url || !publicKey || !secretKey) {
    throw new Error(
      `Formato de status no reconocido. Campos disponibles: ${Object.keys(status).join(", ")}`,
    );
  }
  const parsed = new URL(url);
  if (
    !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
    parsed.port !== "56431"
  )
    throw new Error("URL fuera de la instancia local del tutor.");
  const envPath = join(root, ".env.local");
  let envText = existsSync(envPath)
    ? readFileSync(envPath, "utf8")
    : readFileSync(join(root, ".env.example"), "utf8");
  const existingUrl = envText.match(/^SUPABASE_URL=(.*)$/m)?.[1]?.trim();
  if (
    existingUrl &&
    ![url, "http://127.0.0.1:56431", "http://localhost:56431"].includes(
      existingUrl,
    )
  )
    throw new Error(".env.local apunta a otro proyecto. No se sobrescribirá.");
  for (const [key, value] of Object.entries({
    SUPABASE_URL: "http://127.0.0.1:56431",
    SUPABASE_PUBLISHABLE_KEY: publicKey,
    SUPABASE_SECRET_KEY: secretKey,
  })) {
    const pattern = new RegExp(`^${key}=.*$`, "m");
    envText = pattern.test(envText)
      ? envText.replace(pattern, () => `${key}=${value}`)
      : `${envText.trimEnd()}\n${key}=${value}\n`;
  }
  writeFileSync(envPath, envText, { mode: 0o600 });
  console.log(
    "Supabase del tutor conectado. Claves guardadas en .env.local sin mostrarlas.",
  );
  console.log("API: http://127.0.0.1:56431 | Studio: http://127.0.0.1:56433");
}

if (action === "start") {
  const existing = spawnSync("docker", ["network", "inspect", network], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (existing.status === 0) {
    const info = JSON.parse(existing.stdout)[0];
    if (info.Labels?.["com.fatescipol.project"] !== project)
      throw new Error(
        "El nombre de red está ocupado por otro recurso; no se utilizará.",
      );
  } else {
    const created = spawnSync(
      "docker",
      [
        "network",
        "create",
        "--label",
        `com.fatescipol.project=${project}`,
        "--opt",
        "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
        network,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    if (created.status !== 0)
      throw new Error(
        "No se pudo crear la red exclusiva del tutor. Verifica Docker Desktop.",
      );
  }
  mkdirSync(join(root, ".local"), { recursive: true });
  const logPath = join(root, ".local", "supabase-start.log");
  const log = createWriteStream(logPath, { mode: 0o600 });
  console.log(
    "Iniciando únicamente Supabase del tutor. La primera descarga puede tardar varios minutos.",
  );
  const child = spawn(
    process.execPath,
    [
      cli,
      "start",
      "--exclude",
      "realtime,storage-api,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor",
      "--network-id",
      network,
      "--workdir",
      root,
      "--agent",
      "no",
    ],
    { cwd: root, windowsHide: true },
  );
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const interval = setInterval(
    () =>
      console.log("Supabase del tutor: descargando o comprobando servicios…"),
    25000,
  );
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  clearInterval(interval);
  await new Promise((resolve) => log.end(resolve));
  if (exitCode !== 0)
    throw new Error(
      `El inicio falló. Registro local: ${logPath}. No ejecutar limpiezas globales de Docker.`,
    );
  verifyPublishedPorts();
  syncEnv();
} else if (action === "env") {
  syncEnv();
} else if (action === "stop") {
  runCli(["stop"]);
  console.log(
    "Detenido únicamente Supabase del tutor. Sus volúmenes se conservan.",
  );
} else {
  const status = getStatus();
  console.log(
    `Supabase del tutor responde. API: ${status.API_URL ?? status.api?.url ?? "ver config.toml"}`,
  );
  console.log("Studio: http://127.0.0.1:56433. No se muestran claves.");
}
