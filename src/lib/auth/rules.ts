import { z } from "zod";
import type { Profile } from "@/lib/models";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(
    /^[a-z0-9][a-z0-9._-]*$/,
    "Usa letras sin acentos, números, punto, guion o guion bajo.",
  );
export const passwordSchema = z
  .string()
  .min(12, "La contraseña debe tener al menos 12 caracteres.")
  .max(128);
export const loginSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1).max(128),
});
export function usernameToEmail(username: string, domain: string) {
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))
    throw new Error("AUTH_USERNAME_DOMAIN inválido");
  return `${usernameSchema.parse(username)}@${domain.toLowerCase()}`;
}
export function accessProblem(
  profile: Pick<Profile, "status" | "starts_at" | "expires_at">,
  now = new Date(),
): string | null {
  if (profile.status !== "active")
    return "Tu acceso está desactivado. Contacta a tu administrador.";
  const starts = Date.parse(profile.starts_at);
  const expires = profile.expires_at ? Date.parse(profile.expires_at) : null;
  if (
    !Number.isFinite(starts) ||
    (expires !== null && !Number.isFinite(expires))
  )
    return "No se pudo verificar la vigencia de tu acceso.";
  if (starts > now.getTime()) return "Tu acceso todavía no ha comenzado.";
  if (expires !== null && expires <= now.getTime())
    return "Tu acceso ha expirado. Contacta a tu administrador.";
  return null;
}
export const studentSchema = z
  .object({
    username: usernameSchema,
    full_name: z.string().trim().min(3).max(100),
    password: passwordSchema,
    starts_at: z.iso.datetime({ offset: true }),
    expires_at: z.iso.datetime({ offset: true }),
  })
  .refine((v) => Date.parse(v.expires_at) > Date.parse(v.starts_at), {
    message: "La expiración debe ser posterior al inicio.",
  });
