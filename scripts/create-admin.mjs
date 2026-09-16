import { createClient } from "@supabase/supabase-js";

const required = [
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "BOOTSTRAP_ADMIN_USERNAME",
  "BOOTSTRAP_ADMIN_NAME",
  "BOOTSTRAP_ADMIN_PASSWORD",
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Falta ${key} en .env.local`);
    process.exit(1);
  }
}
const username = process.env.BOOTSTRAP_ADMIN_USERNAME.trim().toLowerCase();
const fullName = process.env.BOOTSTRAP_ADMIN_NAME.trim();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const domain =
  process.env.AUTH_USERNAME_DOMAIN || "usuarios.tutor-fatescipol.invalid";
if (
  !/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username) ||
  fullName.length < 3 ||
  fullName.length > 100 ||
  password.length < 12 ||
  password.length > 128 ||
  !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)
) {
  console.error(
    "Revisa usuario (3–32), nombre (3–100), contraseña (12–128) y dominio.",
  );
  process.exit(1);
}
const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { count, error: checkError } = await db
  .from("profiles")
  .select("id", { count: "exact", head: true })
  .eq("role", "ADMIN");
if (checkError) {
  console.error(
    "No se pudo consultar profiles. Aplica la migración y comprueba la conexión.",
  );
  process.exit(1);
}
if (count > 0) {
  console.error(
    "Ya existe un administrador. Este script solo crea el primero.",
  );
  process.exit(1);
}
const { data, error } = await db.auth.admin.createUser({
  email: `${username}@${domain.toLowerCase()}`,
  password,
  email_confirm: true,
});
if (error || !data.user) {
  console.error(
    "No se pudo crear el administrador. Verifica usuario y política de contraseñas en Supabase.",
  );
  process.exit(1);
}
const { error: profileError } = await db.from("profiles").insert({
  id: data.user.id,
  username,
  full_name: fullName,
  role: "ADMIN",
  status: "active",
  starts_at: new Date().toISOString(),
  expires_at: null,
});
if (profileError) {
  const { error: rollbackError } = await db.auth.admin.deleteUser(data.user.id);
  console.error(
    rollbackError
      ? "Falló el perfil y su reversión. Revisa la cuenta incompleta en Supabase Auth."
      : "Falló el perfil. Se revirtió la cuenta de Auth.",
  );
  process.exit(1);
}
console.log(
  `Administrador @${username} creado. Elimina BOOTSTRAP_ADMIN_PASSWORD de .env.local e inicia sesión.`,
);
