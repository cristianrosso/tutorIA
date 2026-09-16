import { test, expect } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill(username);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("fixture-password-2026");
  await page.getByRole("button", { name: "Ingresar a mi aula" }).click();
}
test("estudiante navega, conserva sesión, no entra a admin y cierra sesión", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signIn(page, "student.test");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Bienvenido, Estudiante." }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver tutor" })).toBeVisible();
  await page.getByRole("link", { name: "Ver tutor" }).click();
  await expect(page).toHaveURL(/\/tutor$/);
  await expect(
    page.getByRole("heading", { name: "Cómo responderá el tutor" }),
  ).toBeVisible();
  await page.goto("/simulacro");
  await expect(
    page.getByRole("heading", { name: "Examen oral de Doctrina Policial" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Iniciar simulacro" }),
  ).toBeVisible();
  await page.reload();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Bienvenido, Estudiante." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/dashboard-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("link", { name: "Explorar unidades" }).click();
  await expect(
    page.getByRole("heading", { name: "Doctrina Policial" }),
  ).toBeVisible();
  await expect(page.getByText("Próximamente", { exact: true })).toHaveCount(14);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
test("administrador ve métricas reales del contrato y formularios", async ({
  page,
}, testInfo) => {
  await signIn(page, "admin.test");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(
    page.getByRole("heading", { name: "Panel de administración." }),
  ).toBeVisible();
  await expect(
    page.getByText("Usuarios registrados", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Crear estudiante" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/admin-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Período", exact: true })
    .selectOption("week");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/period=week/);
});
test("credenciales inválidas y cuenta inactiva muestran error", async ({
  page,
}) => {
  await signIn(page, "invalid.test");
  await expect(page.locator(".login-form [role='alert']")).toHaveText(
    "Usuario o contraseña incorrectos.",
  );
  await signIn(page, "inactive.test");
  await expect(page.locator(".login-form [role='alert']")).toContainText(
    "desactivado",
  );
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
