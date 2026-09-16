import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

// Cuentas efímeras reales de prueba. No son credenciales permanentes del usuario.
// No se guardan trazas, vídeos ni capturas que puedan registrar contraseñas.
test("Sprint 1 con Supabase real en Docker: alta, roles, acceso, expiración, reset y RLS", async ({
  browser,
  page,
  baseURL,
}) => {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const domain =
    process.env.AUTH_USERNAME_DOMAIN || "usuarios.tutor-fatescipol.invalid";
  const clientOptions = {
    auth: { persistSession: false, autoRefreshToken: false },
  };
  const service = createClient(
    url,
    process.env.SUPABASE_SECRET_KEY!,
    clientOptions,
  );
  const unique = randomBytes(5).toString("hex");
  const adminUsername = `qa.admin.${unique}`;
  const studentUsername = `qa.student.${unique}`;
  const adminPassword = randomBytes(24).toString("base64url");
  const studentPassword = randomBytes(24).toString("base64url");
  const resetPassword = randomBytes(24).toString("base64url");
  let adminId: string | undefined;
  let studentId: string | undefined;
  const studentContext = await browser.newContext({ baseURL });
  const studentPage = await studentContext.newPage();
  const logIn = async (
    target: typeof page,
    username: string,
    password: string,
  ) => {
    await target.goto("/login");
    await target.getByLabel("Usuario", { exact: true }).fill(username);
    await target.getByLabel("Contraseña", { exact: true }).fill(password);
    await target.getByRole("button", { name: "Ingresar a mi aula" }).click();
  };
  try {
    const adminResult = await service.auth.admin.createUser({
      email: `${adminUsername}@${domain}`,
      password: adminPassword,
      email_confirm: true,
    });
    if (adminResult.error || !adminResult.data.user)
      throw new Error(
        `Alta de ADMIN de prueba falló (${adminResult.error?.status ?? "sin usuario"}).`,
      );
    adminId = adminResult.data.user.id;
    const inserted = await service.from("profiles").insert({
      id: adminId,
      username: adminUsername,
      full_name: "Administrador de verificación",
      role: "ADMIN",
      status: "active",
      starts_at: "2020-01-01T00:00:00Z",
      expires_at: null,
    });
    if (inserted.error)
      throw new Error(`Perfil de prueba: ${inserted.error.code}`);
    await logIn(page, adminUsername, adminPassword);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(
      page.getByRole("heading", { name: "Panel de administración." }),
    ).toBeVisible();
    const createForm = page.locator(".admin-form");
    await createForm
      .getByLabel("Nombre completo")
      .fill("Estudiante de verificación");
    await createForm
      .getByLabel("Usuario", { exact: true })
      .fill(studentUsername);
    await createForm.getByLabel("Contraseña inicial").fill(studentPassword);
    await createForm.getByLabel("Inicio del acceso").fill("2020-01-01");
    await createForm.getByLabel("Último día de acceso").fill("2099-01-01");
    await createForm.getByRole("button", { name: "Crear estudiante" }).click();
    await expect(createForm.locator("[role=status]")).toContainText("creada");
    const studentRecord = await service
      .from("profiles")
      .select("id")
      .eq("username", studentUsername)
      .single();
    if (!studentRecord.data) throw new Error("No se creó el estudiante.");
    studentId = studentRecord.data.id;
    await logIn(studentPage, studentUsername, studentPassword);
    await expect(studentPage).toHaveURL(/\/dashboard$/);
    await expect(
      studentPage.getByRole("heading", { name: "Bienvenido, Estudiante." }),
    ).toBeVisible();
    await studentPage.goto("/tutor");
    await expect(
      studentPage.getByRole("heading", {
        name: "Cómo responderá el tutor",
      }),
    ).toBeVisible();
    await studentPage.goto("/simulacro");
    await expect(
      studentPage.getByRole("heading", {
        name: "Examen oral de Doctrina Policial",
      }),
    ).toBeVisible();
    await studentPage.goto("/unidades");
    await expect(
      studentPage.getByRole("heading", { name: "Doctrina Policial" }),
    ).toBeVisible();
    await studentPage.goto("/admin");
    await expect(studentPage).toHaveURL(/\/dashboard$/);

    const studentClient = createClient(url, key, clientOptions);
    const studentLogin = await studentClient.auth.signInWithPassword({
      email: `${studentUsername}@${domain}`,
      password: studentPassword,
    });
    expect(Boolean(studentLogin.error)).toBe(false);
    const visibleProfiles = await studentClient.from("profiles").select("id");
    expect(visibleProfiles.data?.map((p) => p.id)).toEqual([studentId]);
    const promotion = await studentClient
      .from("profiles")
      .update({ role: "ADMIN" })
      .eq("id", studentId!);
    expect(Boolean(promotion.error)).toBe(true);
    const anon = createClient(url, key, clientOptions);
    expect(Boolean((await anon.from("profiles").select("id")).error)).toBe(
      true,
    );
    const signup = await anon.auth.signUp({
      email: `qa.signup.${unique}@${domain}`,
      password: studentPassword,
    });
    expect(Boolean(signup.error)).toBe(true);

    const row = page
      .locator(".user-row")
      .filter({ hasText: `@${studentUsername}` });
    await row.locator("summary").click();
    const accessForm = row.locator("form").first();
    await accessForm
      .getByRole("combobox", { name: "Estado" })
      .selectOption("inactive");
    await accessForm.getByRole("button", { name: "Guardar" }).click();
    await expect(accessForm.locator("[role=status]")).toContainText(
      "actualizado",
    );
    await studentPage.reload();
    await expect(studentPage).toHaveURL(/\/login\?estado=sin-acceso$/);
    expect((await studentClient.from("units").select("id")).data).toEqual([]);

    await accessForm
      .getByRole("combobox", { name: "Estado" })
      .selectOption("active");
    await accessForm.getByLabel("Último día de acceso").fill("2021-01-01");
    await accessForm.getByRole("button", { name: "Guardar" }).click();
    await expect
      .poll(
        async () =>
          (
            await service
              .from("profiles")
              .select("status,expires_at")
              .eq("id", studentId!)
              .single()
          ).data?.expires_at,
      )
      .toContain("2021");
    await logIn(studentPage, studentUsername, studentPassword);
    await expect(studentPage.locator(".login-form [role=alert]")).toContainText(
      "expirado",
    );

    await accessForm.getByLabel("Último día de acceso").fill("2099-01-01");
    await accessForm.getByRole("button", { name: "Guardar" }).click();
    await expect
      .poll(
        async () =>
          (
            await service
              .from("profiles")
              .select("expires_at")
              .eq("id", studentId!)
              .single()
          ).data?.expires_at,
      )
      .toContain("2099");
    const resetForm = row.locator("form").nth(1);
    await resetForm.getByLabel("Nueva contraseña").fill(resetPassword);
    await resetForm.getByRole("button", { name: "Restablecer" }).click();
    await expect(resetForm.locator("[role=status]")).toContainText(
      "actualizada",
    );
    await logIn(studentPage, studentUsername, studentPassword);
    await expect(studentPage.locator(".login-form [role=alert]")).toContainText(
      "incorrectos",
    );
    await logIn(studentPage, studentUsername, resetPassword);
    await expect(studentPage).toHaveURL(/\/dashboard$/);
    await studentPage.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(studentPage).toHaveURL(/\/login$/);
    await studentPage.goto("/dashboard");
    await expect(studentPage).toHaveURL(/\/login$/);
    await studentClient.auth.signOut();
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    await studentContext.close();
    // Resuelve solo el nombre único creado por esta prueba, nunca borra otras cuentas.
    if (!studentId)
      studentId = (
        await service
          .from("profiles")
          .select("id")
          .eq("username", studentUsername)
          .maybeSingle()
      ).data?.id;
    for (const id of [studentId, adminId]) {
      if (!id) continue;
      const removed = await service.auth.admin.deleteUser(id);
      if (removed.error)
        throw new Error(`No se pudo limpiar la cuenta efímera ${id}.`);
    }
  }
});
