import { describe, expect, it } from "vitest";
import {
  accessProblem,
  loginSchema,
  studentSchema,
  usernameToEmail,
} from "@/lib/auth/rules";
import { periodStart, summarizeUsage } from "@/lib/metrics";

const now = new Date("2026-09-14T12:00:00Z");
const active = {
  status: "active" as const,
  starts_at: "2026-01-01T00:00:00Z",
  expires_at: "2027-01-01T00:00:00Z",
};
describe("Acceso y validación", () => {
  it("normaliza usuario sin permitir inyección de dominio", () => {
    expect(usernameToEmail("  Cadete.01 ", "aula.invalid")).toBe(
      "cadete.01@aula.invalid",
    );
    expect(() => usernameToEmail("admin@otra.com", "aula.invalid")).toThrow();
    expect(() => usernameToEmail("admin", "bad/domain")).toThrow();
  });
  it("acepta acceso vigente", () =>
    expect(accessProblem(active, now)).toBeNull());
  it("rechaza inactivos", () =>
    expect(accessProblem({ ...active, status: "inactive" }, now)).toContain(
      "desactivado",
    ));
  it("rechaza acceso futuro", () =>
    expect(
      accessProblem({ ...active, starts_at: "2027-01-01T00:00:00Z" }, now),
    ).toContain("comenzado"));
  it("expira en el instante exacto", () =>
    expect(
      accessProblem({ ...active, expires_at: now.toISOString() }, now),
    ).toContain("expirado"));
  it("cierra acceso con fechas inválidas", () =>
    expect(accessProblem({ ...active, starts_at: "bad" }, now)).not.toBeNull());
  it("permite administrador sin vencimiento", () =>
    expect(accessProblem({ ...active, expires_at: null }, now)).toBeNull());
  it("rechaza passwords excesivos y usernames inválidos", () => {
    expect(
      loginSchema.safeParse({ username: "ab", password: "x" }).success,
    ).toBe(false);
    expect(
      loginSchema.safeParse({ username: "abc", password: "x".repeat(129) })
        .success,
    ).toBe(false);
  });
  it("valida orden de fechas y contraseña de alta", () => {
    const student = {
      username: "cadete",
      full_name: "Persona de prueba",
      password: "password-test-123",
      starts_at: active.starts_at,
      expires_at: active.expires_at,
    };
    expect(studentSchema.safeParse(student).success).toBe(true);
    expect(
      studentSchema.safeParse({ ...student, expires_at: active.starts_at })
        .success,
    ).toBe(false);
    expect(
      studentSchema.safeParse({ ...student, password: "short" }).success,
    ).toBe(false);
  });
});
describe("Métricas", () => {
  const event = {
    user_id: "student",
    input_tokens: 100,
    output_tokens: 50,
    audio_input: 30,
    audio_output: 45,
    estimated_cost: 0.02,
  };
  it("agrega tokens y audio; el promedio excluye gasto de administrador", () => {
    const result = summarizeUsage(
      [event, { ...event, user_id: "admin", estimated_cost: 10 }],
      ["student", "no-usage"],
    );
    expect(result.tokens).toBe(300);
    expect(result.audioSeconds).toBe(150);
    expect(result.knownCost).toBe(10.02);
    expect(result.averageCost).toBe(0.01);
  });
  it("no informa costo desconocido como cero ni promedio completo", () => {
    const result = summarizeUsage(
      [{ ...event, estimated_cost: null }],
      ["student"],
    );
    expect(result.missingCosts).toBe(1);
    expect(result.averageCost).toBeNull();
  });
  it("sin estudiantes no divide por cero", () =>
    expect(summarizeUsage([], []).averageCost).toBeNull());
  it("calcula ventanas móviles deterministas", () => {
    expect(periodStart("day", now)).toBe("2026-09-13T12:00:00.000Z");
    expect(periodStart("week", now)).toBe("2026-09-07T12:00:00.000Z");
    expect(periodStart("month", now)).toBe("2026-08-15T12:00:00.000Z");
  });
});
