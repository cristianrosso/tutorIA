import { test, expect } from "@playwright/test";

test("acceso honesto sin credenciales, responsive y sin errores JS", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Tutor IA FATESCIPOL" }),
  ).toBeVisible();
  await expect(page.getByText("Estamos preparando tu aula")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ingresar a mi aula" }),
  ).toBeDisabled();
  await expect(page.getByLabel("Usuario", { exact: true })).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/login-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Ver estado de configuración" }).click();
  await expect(
    page.getByRole("heading", { name: "Conectemos tu aula" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("las rutas privadas no simulan una sesión sin Supabase", async ({
  page,
}) => {
  for (const route of [
    "/dashboard",
    "/tutor",
    "/simulacro",
    "/inicio",
    "/admin",
    "/unidades",
    "/progreso",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/configuracion$/);
  }
});

test("cabeceras de seguridad y página inexistente", async ({
  page,
  request,
}) => {
  const response = await request.get("/login");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
  await page.goto("/pagina-que-no-existe");
  await expect(
    page.getByRole("heading", { name: "Esta página no está en tu programa" }),
  ).toBeVisible();
});
