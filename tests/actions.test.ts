import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: vi.fn(),
  limit: vi.fn(),
  server: vi.fn(),
  adminClient: vi.fn(),
  requireAdmin: vi.fn(),
  getProfile: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/config", () => ({
  isConfigured: mocks.configured,
  usernameDomain: () => "test.invalid",
}));
vi.mock("@/lib/auth/rate-limit", () => ({ consumeLimit: mocks.limit }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: mocks.server,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: mocks.adminClient,
}));
vi.mock("@/lib/auth/session", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { login, logout } from "@/app/actions/auth";
import { createStudent, updateStudent } from "@/app/actions/admin";

const form = (entries: Record<string, string>) => {
  const result = new FormData();
  Object.entries(entries).forEach(([key, value]) => result.set(key, value));
  return result;
};
const credentials = () =>
  form({ username: "student", password: "fixture-password-only" });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.configured.mockReturnValue(true);
  mocks.limit.mockResolvedValue(true);
  mocks.signIn.mockResolvedValue({
    data: {
      user: { id: "student-id" },
      session: {
        access_token:
          "header.eyJzZXNzaW9uX2lkIjoiMDAwMDAwMDAtMDAwMC00MDAwLWEwMDAtMDAwMDAwMDAwMDAxIn0.signature",
      },
    },
    error: null,
  });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.getProfile.mockResolvedValue({
    data: {
      id: "student-id",
      role: "ESTUDIANTE",
      status: "active",
      starts_at: "2020-01-01T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
    },
  });
  mocks.adminClient.mockReturnValue({
    from: () => ({
      update: () => ({
        eq: () => ({
          is: () => ({ neq: () => Promise.resolve({ error: null }) }),
        }),
      }),
      upsert: () => Promise.resolve({ error: null }),
    }),
  });
  mocks.server.mockResolvedValue({
    auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut },
    from: () => ({
      select: () => ({ eq: () => ({ single: mocks.getProfile }) }),
    }),
  });
});
describe("Server actions de autenticación", () => {
  it("sin configuración no llama al proveedor", async () => {
    mocks.configured.mockReturnValue(false);
    expect((await login({}, credentials())).error).toContain("configuración");
    expect(mocks.server).not.toHaveBeenCalled();
  });
  it("valida antes de conectar", async () => {
    expect(
      (await login({}, form({ username: "x", password: "x" }))).error,
    ).toBeTruthy();
    expect(mocks.limit).not.toHaveBeenCalled();
  });
  it("no autentica si se alcanza el límite", async () => {
    mocks.limit.mockResolvedValue(false);
    expect((await login({}, credentials())).error).toContain("Demasiados");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("cierra acceso si falla el limitador persistente", async () => {
    mocks.limit.mockRejectedValue(new Error("database offline"));
    expect((await login({}, credentials())).error).toContain("servicio");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
  it("usa error genérico para credenciales incorrectas", async () => {
    mocks.signIn.mockResolvedValue({
      data: { user: null },
      error: { message: "internal detail" },
    });
    expect((await login({}, credentials())).error).toBe(
      "Usuario o contraseña incorrectos.",
    );
  });
  it("redirige estudiante y normaliza el email en servidor", async () => {
    await expect(login({}, credentials())).rejects.toThrow(
      "REDIRECT:/dashboard",
    );
    expect(mocks.signIn).toHaveBeenCalledWith({
      email: "student@test.invalid",
      password: "fixture-password-only",
    });
  });
  it("redirige administrador según perfil persistido", async () => {
    mocks.getProfile.mockResolvedValue({
      data: {
        role: "ADMIN",
        status: "active",
        starts_at: "2020-01-01T00:00:00Z",
        expires_at: null,
      },
    });
    await expect(login({}, credentials())).rejects.toThrow("REDIRECT:/admin");
  });
  it("elimina sesión de cuenta expirada", async () => {
    mocks.getProfile.mockResolvedValue({
      data: {
        role: "ADMIN",
        status: "active",
        starts_at: "2020-01-01T00:00:00Z",
        expires_at: "2021-01-01T00:00:00Z",
      },
    });
    expect((await login({}, credentials())).error).toContain("expirado");
    expect(mocks.signOut).toHaveBeenCalled();
  });
  it("sin perfil no concede acceso y cierra sesión", async () => {
    mocks.getProfile.mockResolvedValue({ data: null });
    expect((await login({}, credentials())).error).toContain("habilitado");
    expect(mocks.signOut).toHaveBeenCalled();
  });
  it("logout invalida la sesión local y redirige", async () => {
    await expect(logout()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
describe("Administración", () => {
  it.each([createStudent, updateStudent])(
    "rechaza mutaciones antes de obtener cliente privilegiado",
    async (action) => {
      mocks.requireAdmin.mockRejectedValue(new Error("REDIRECT:/dashboard"));
      await expect(action({}, form({}))).rejects.toThrow("REDIRECT:/dashboard");
      expect(mocks.adminClient).not.toHaveBeenCalled();
    },
  );
  it("revierte Auth si falla la inserción del perfil", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
    const remove = vi.fn().mockResolvedValue({ error: null });
    mocks.adminClient.mockReturnValue({
      auth: {
        admin: {
          createUser: vi
            .fn()
            .mockResolvedValue({ data: { user: { id: "new-user" } } }),
          deleteUser: remove,
        },
      },
      from: () => ({
        insert: vi.fn().mockResolvedValue({ error: { code: "23505" } }),
      }),
    });
    const result = await createStudent(
      {},
      form({
        username: "teststudent",
        full_name: "Prueba Usuario",
        password: "test-password-1234",
        starts_at: "2026-01-01",
        expires_at: "2027-01-01",
      }),
    );
    expect(result.error).toContain("perfil");
    expect(remove).toHaveBeenCalledWith("new-user");
  });
  it("no permite modificar un administrador desde el formulario de estudiantes", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
    const updateUser = vi.fn();
    mocks.adminClient.mockReturnValue({
      auth: { admin: { updateUserById: updateUser } },
      from: () => ({
        select: () => ({
          eq: () => ({ single: async () => ({ data: { role: "ADMIN" } }) }),
        }),
      }),
    });
    const result = await updateStudent(
      {},
      form({
        id: "00000000-0000-4000-a000-000000000001",
        operation: "password",
        password: "test-password-1234",
      }),
    );
    expect(result.error).toContain("estudiantes");
    expect(updateUser).not.toHaveBeenCalled();
  });
});
