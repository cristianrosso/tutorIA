"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import {
  studentSchema,
  passwordSchema,
  usernameToEmail,
} from "@/lib/auth/rules";
import { usernameDomain } from "@/lib/config";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { consumeLimit } from "@/lib/auth/rate-limit";
import { ingestDocument } from "@/lib/rag/ingest";
import type { ActionState } from "@/lib/models";
import { createLicenseRecord, logAdminAction } from "@/lib/admin/admin-service";

function dateInput(value: FormDataEntryValue | null, endOfDay = false) {
  // Fechas del panel se interpretan explícitamente en Bolivia, UTC−4.
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T${endOfDay ? "23:59:59" : "00:00:00"}-04:00`
    : "";
}
export async function createStudent(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = studentSchema.safeParse({
    ...Object.fromEntries(form),
    starts_at: dateInput(form.get("starts_at")),
    expires_at: dateInput(form.get("expires_at"), true),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message || "Revisa los campos." };
  try {
    if (!(await consumeLimit(`admin:${admin.id}`, 30, 60)))
      return { error: "Espera un minuto antes de continuar." };
    const db = createSupabaseAdmin();
    const { username, full_name, password, starts_at, expires_at } =
      parsed.data;
    const { data, error } = await db.auth.admin.createUser({
      email: usernameToEmail(username, usernameDomain()),
      password,
      email_confirm: true,
    });
    if (error || !data.user)
      return {
        error:
          "No se pudo crear la cuenta. Comprueba que el usuario no exista y que la contraseña cumpla las políticas de Supabase.",
      };
    const { error: profileError } = await db.from("profiles").insert({
      id: data.user.id,
      username,
      full_name,
      role: "ESTUDIANTE",
      status: "active",
      starts_at,
      expires_at,
    });
    if (profileError) {
      const { error: rollbackError } = await db.auth.admin.deleteUser(
        data.user.id,
      );
      console.error(
        JSON.stringify({
          event: "student_profile_creation_failed",
          user_id: data.user.id,
          rollback_failed: Boolean(rollbackError),
        }),
      );
      return {
        error:
          "No se pudo completar el perfil. Revisa el esquema y los registros del servidor.",
      };
    }
    console.info(
      JSON.stringify({
        event: "student_created",
        actor: admin.id,
        user_id: data.user.id,
      }),
    );
    await createLicenseRecord({
      userId: data.user.id,
      actorId: admin.id,
      activatedAt: starts_at,
      expiresAt: expires_at,
      durationDays: Math.max(
        1,
        Math.round((Date.parse(expires_at) - Date.parse(starts_at)) / 86400000),
      ),
      source: "admin_panel",
      notes: "Licencia inicial creada con el estudiante.",
    });
    await logAdminAction({
      actorId: admin.id,
      action: "student_created",
      resourceType: "profile",
      resourceId: data.user.id,
      metadata: { username, expires_at },
    });
    revalidatePath("/admin");
    revalidatePath("/admin/students");
    revalidatePath("/admin/licenses");
    return {
      success: `Cuenta ${username} creada. Entrega sus credenciales por un canal privado.`,
    };
  } catch {
    return { error: "El servicio no está disponible. Vuelve a intentarlo." };
  }
}

export async function updateStudent(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse(form.get("id"));
  const operation = z
    .enum(["access", "password"])
    .safeParse(form.get("operation"));
  if (!id.success || !operation.success)
    return { error: "Solicitud inválida." };
  try {
    if (!(await consumeLimit(`admin:${admin.id}`, 30, 60)))
      return { error: "Espera un minuto antes de continuar." };
    const db = createSupabaseAdmin();
    const { data: target, error } = await db
      .from("profiles")
      .select("role, starts_at")
      .eq("id", id.data)
      .single();
    if (error || target?.role !== "ESTUDIANTE")
      return { error: "Solo se pueden modificar cuentas de estudiantes." };
    if (operation.data === "password") {
      const password = passwordSchema.safeParse(form.get("password"));
      if (!password.success)
        return { error: "Usa una contraseña de entre 12 y 128 caracteres." };
      const { error: updateError } = await db.auth.admin.updateUserById(
        id.data,
        { password: password.data },
      );
      if (updateError)
        return {
          error:
            "No se pudo restablecer la contraseña. Revisa la política de contraseñas de Supabase.",
        };
      await logAdminAction({
        actorId: admin.id,
        action: "student_password_reset",
        resourceType: "profile",
        resourceId: id.data,
      });
    } else {
      const status = z
        .enum(["active", "inactive"])
        .safeParse(form.get("status"));
      const expires = dateInput(form.get("expires_at"), true);
      if (
        !status.success ||
        !z.iso.datetime({ offset: true }).safeParse(expires).success ||
        Date.parse(expires) <= Date.parse(target.starts_at)
      )
        return { error: "Revisa el estado y la fecha de expiración." };
      const { error: updateError } = await db
        .from("profiles")
        .update({ status: status.data, expires_at: expires })
        .eq("id", id.data)
        .eq("role", "ESTUDIANTE");
      if (updateError) return { error: "No se pudo actualizar el acceso." };
      await logAdminAction({
        actorId: admin.id,
        action: "student_access_updated",
        resourceType: "profile",
        resourceId: id.data,
        metadata: { status: status.data, expires_at: expires },
      });
    }
    console.info(
      JSON.stringify({
        event: `student_${operation.data}_updated`,
        actor: admin.id,
        user_id: id.data,
      }),
    );
    revalidatePath("/admin");
    revalidatePath("/admin/students");
    revalidatePath("/admin/licenses");
    return {
      success:
        operation.data === "password"
          ? "Contraseña actualizada. Entrega la nueva contraseña por un canal privado."
          : "Acceso actualizado.",
    };
  } catch {
    return { error: "El servicio no está disponible. Vuelve a intentarlo." };
  }
}

export async function activateMonthlyLicense(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse(form.get("id"));
  const start = dateInput(form.get("starts_at"));
  const duration = z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .safeParse(form.get("duration_days"));
  if (
    !id.success ||
    !z.iso.datetime({ offset: true }).safeParse(start).success ||
    !duration.success
  )
    return { error: "Revisa estudiante, fecha de activación y duración." };
  try {
    const db = createSupabaseAdmin();
    const { data: target, error } = await db
      .from("profiles")
      .select("role,expires_at")
      .eq("id", id.data)
      .single();
    if (error || target?.role !== "ESTUDIANTE")
      return { error: "Solo se pueden activar licencias de estudiantes." };
    const now = new Date();
    if (
      target.expires_at &&
      Date.parse(target.expires_at) > now.getTime() &&
      Date.parse(start) <= Date.parse(target.expires_at)
    )
      return {
        error:
          "Este estudiante ya tiene una licencia vigente. Usa renovar para extenderla.",
      };
    const expires = new Date(
      Date.parse(start) + duration.data * 86400000 - 1000,
    ).toISOString();
    const { error: updateError } = await db
      .from("profiles")
      .update({ status: "active", starts_at: start, expires_at: expires })
      .eq("id", id.data)
      .eq("role", "ESTUDIANTE");
    if (updateError) return { error: "No se pudo activar la licencia." };
    await createLicenseRecord({
      userId: id.data,
      actorId: admin.id,
      activatedAt: start,
      expiresAt: expires,
      durationDays: duration.data,
      source: "admin_panel",
    });
    await logAdminAction({
      actorId: admin.id,
      action: "license_activated",
      resourceType: "profile",
      resourceId: id.data,
      metadata: {
        starts_at: start,
        expires_at: expires,
        duration_days: duration.data,
      },
    });
    revalidatePath("/admin/licenses");
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${id.data}`);
    return { success: "Licencia activada correctamente." };
  } catch {
    return { error: "No se pudo activar la licencia." };
  }
}

export async function renewMonthlyLicense(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse(form.get("id"));
  const duration = z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .safeParse(form.get("duration_days"));
  if (!id.success || !duration.success) return { error: "Solicitud inválida." };
  try {
    const db = createSupabaseAdmin();
    const { data: target, error } = await db
      .from("profiles")
      .select("role,starts_at,expires_at")
      .eq("id", id.data)
      .single();
    if (error || target?.role !== "ESTUDIANTE")
      return { error: "Solo se pueden renovar licencias de estudiantes." };
    const base =
      target.expires_at && Date.parse(target.expires_at) > Date.now()
        ? new Date(target.expires_at)
        : new Date();
    const expires = new Date(
      base.getTime() + duration.data * 86400000,
    ).toISOString();
    const starts = target.starts_at || new Date().toISOString();
    const { error: updateError } = await db
      .from("profiles")
      .update({ status: "active", starts_at: starts, expires_at: expires })
      .eq("id", id.data)
      .eq("role", "ESTUDIANTE");
    if (updateError) return { error: "No se pudo renovar la licencia." };
    await createLicenseRecord({
      userId: id.data,
      actorId: admin.id,
      activatedAt: base.toISOString(),
      expiresAt: expires,
      durationDays: duration.data,
      source: "renewal",
    });
    await logAdminAction({
      actorId: admin.id,
      action: "license_renewed",
      resourceType: "profile",
      resourceId: id.data,
      metadata: {
        previous_expires_at: target.expires_at,
        new_expires_at: expires,
        duration_days: duration.data,
      },
    });
    revalidatePath("/admin/licenses");
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${id.data}`);
    return { success: "Licencia renovada correctamente." };
  } catch {
    return { error: "No se pudo renovar la licencia." };
  }
}

export async function suspendStudentAccess(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return { error: "Solicitud inválida." };
  try {
    const { error } = await createSupabaseAdmin()
      .from("profiles")
      .update({ status: "inactive" })
      .eq("id", id.data)
      .eq("role", "ESTUDIANTE");
    if (error) return { error: "No se pudo suspender el acceso." };
    await logAdminAction({
      actorId: admin.id,
      action: "student_access_suspended",
      resourceType: "profile",
      resourceId: id.data,
    });
    revalidatePath("/admin/licenses");
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${id.data}`);
    return { success: "Acceso suspendido." };
  } catch {
    return { error: "No se pudo suspender el acceso." };
  }
}

const documentSchema = z.object({
  title: z.string().trim().min(5).max(140),
  source: z.string().trim().min(5).max(160),
  version: z.string().trim().min(1).max(30),
  content: z.string().trim().min(200),
});

export async function ingestUnitOneDocument(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = documentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      error:
        parsed.error.issues[0]?.message ||
        "Revisa el texto del compendio antes de cargarlo.",
    };
  try {
    if (!(await consumeLimit(`admin:${admin.id}`, 10, 60)))
      return { error: "Espera un minuto antes de cargar otro documento." };
    const result = await ingestDocument({
      unitNumber: 1,
      ...parsed.data,
    });
    console.info(
      JSON.stringify({
        event: "document_ingested",
        actor: admin.id,
        document_id: result.documentId,
        chunks: result.chunks,
      }),
    );
    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath("/tutor");
    return {
      success: `Documento cargado para Unidad 1 con ${result.chunks} fragmentos.`,
    };
  } catch {
    return {
      error:
        "No se pudo cargar el documento. Verifica el texto y el estado de Supabase.",
    };
  }
}
