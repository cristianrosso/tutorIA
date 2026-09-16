import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Usuario", { exact: true }).fill("student.test");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("fixture-password-2026");
  await page.getByRole("button", { name: "Ingresar a mi aula" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("tutor de voz muestra controles móviles para estudiante autenticado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.goto("/tutor");
  await expect(page.getByText("LISTO PARA HABLAR")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Iniciar grabación" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Escuchar" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Detener voz" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Preguntar por texto" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
