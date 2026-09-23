"use client";
import { useActionState } from "react";
import { FileText, KeyRound, Plus, Save, Upload } from "lucide-react";
import {
  activateMonthlyLicense,
  createStudent,
  ingestUnitOneDocument,
  renewMonthlyLicense,
  suspendStudentAccess,
  updateStudent,
} from "@/app/actions/admin";
import type { ActionState, Profile } from "@/lib/models";

function Feedback({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && (
        <p className="notice error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="notice success" role="status">
          {state.success}
        </p>
      )}
    </>
  );
}
export function CreateStudentForm() {
  const [state, action, pending] = useActionState(createStudent, {});
  return (
    <form action={action} className="admin-form">
      <div className="form-grid">
        <label>
          Nombre completo
          <input
            name="full_name"
            required
            minLength={3}
            maxLength={100}
            autoComplete="off"
            placeholder="Nombre y apellidos"
          />
        </label>
        <label>
          Usuario
          <input
            name="username"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-z0-9][a-z0-9._\-]{2,31}"
            autoCapitalize="none"
            autoComplete="off"
            placeholder="Ej. estudiante.01"
          />
        </label>
        <label>
          Contraseña inicial
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            placeholder="Al menos 12 caracteres"
          />
        </label>
        <label>
          Inicio del acceso
          <input type="date" name="starts_at" required />
        </label>
        <label>
          Último día de acceso
          <input type="date" name="expires_at" required />
        </label>
      </div>
      <p className="muted small">
        Fechas en horario de Bolivia (UTC−4). El acceso vence al finalizar el
        último día indicado.
      </p>
      <Feedback state={state} />
      <button className="button primary" disabled={pending}>
        <Plus size={17} />
        {pending ? "Creando cuenta…" : "Crear estudiante"}
      </button>
    </form>
  );
}
export function EditStudentForms({ profile }: { profile: Profile }) {
  const [state, action, pending] = useActionState(updateStudent, {});
  const [passwordState, passwordAction, passwordPending] = useActionState(
    updateStudent,
    {},
  );
  const localDate = profile.expires_at
    ? new Date(Date.parse(profile.expires_at) - 4 * 3600000)
        .toISOString()
        .slice(0, 10)
    : "";
  return (
    <details className="student-details">
      <summary>Gestionar acceso</summary>
      <form action={action} className="inline-admin-form">
        <input type="hidden" name="id" value={profile.id} />
        <input type="hidden" name="operation" value="access" />
        <label>
          Estado
          <select name="status" defaultValue={profile.status}>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
          </select>
        </label>
        <label>
          Último día de acceso
          <input
            name="expires_at"
            type="date"
            required
            defaultValue={localDate}
          />
        </label>
        <button className="button secondary" disabled={pending}>
          <Save size={15} />
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <Feedback state={state} />
      </form>
      <form action={passwordAction} className="inline-admin-form">
        <input type="hidden" name="id" value={profile.id} />
        <input type="hidden" name="operation" value="password" />
        <label>
          Nueva contraseña
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </label>
        <button className="button secondary" disabled={passwordPending}>
          <KeyRound size={15} />
          {passwordPending ? "Actualizando…" : "Restablecer"}
        </button>
        <Feedback state={passwordState} />
      </form>
    </details>
  );
}

export function LicenseActions({
  profile,
  defaultDurationDays = 30,
}: {
  profile: Pick<Profile, "id" | "starts_at" | "expires_at" | "status">;
  defaultDurationDays?: number;
}) {
  const [activateState, activateAction, activatePending] = useActionState(
    activateMonthlyLicense,
    {},
  );
  const [renewState, renewAction, renewPending] = useActionState(
    renewMonthlyLicense,
    {},
  );
  const [suspendState, suspendAction, suspendPending] = useActionState(
    suspendStudentAccess,
    {},
  );
  const today = new Date().toISOString().slice(0, 10);
  return (
    <details className="student-details">
      <summary>Licencia mensual</summary>
      <form action={activateAction} className="inline-admin-form">
        <input type="hidden" name="id" value={profile.id} />
        <label>
          Activar desde
          <input name="starts_at" type="date" required defaultValue={today} />
        </label>
        <label>
          Duración
          <input
            name="duration_days"
            type="number"
            min={1}
            max={365}
            required
            defaultValue={defaultDurationDays}
          />
        </label>
        <button className="button secondary" disabled={activatePending}>
          <Save size={15} />
          {activatePending ? "Activando…" : "Activar"}
        </button>
        <Feedback state={activateState} />
      </form>
      <form action={renewAction} className="inline-admin-form">
        <input type="hidden" name="id" value={profile.id} />
        <label>
          Renovar días
          <input
            name="duration_days"
            type="number"
            min={1}
            max={365}
            required
            defaultValue={defaultDurationDays}
          />
        </label>
        <button className="button secondary" disabled={renewPending}>
          <Save size={15} />
          {renewPending ? "Renovando…" : "Renovar"}
        </button>
        <Feedback state={renewState} />
      </form>
      <form action={suspendAction} className="inline-admin-form">
        <input type="hidden" name="id" value={profile.id} />
        <button
          className="button secondary danger-button"
          disabled={suspendPending}
        >
          {suspendPending ? "Suspendiendo…" : "Suspender acceso"}
        </button>
        <Feedback state={suspendState} />
      </form>
    </details>
  );
}

export function IngestDocumentForm() {
  const [state, action, pending] = useActionState(ingestUnitOneDocument, {});
  return (
    <form action={action} className="admin-form document-form">
      <div className="form-grid compact">
        <label>
          Título del documento
          <input
            name="title"
            required
            minLength={5}
            maxLength={140}
            defaultValue="Compendio FATESCIPOL 2026 - Unidad 1"
          />
        </label>
        <label>
          Fuente
          <input
            name="source"
            required
            minLength={5}
            maxLength={160}
            defaultValue="Compendio FATESCIPOL 2026"
          />
        </label>
        <label>
          Versión
          <input name="version" required defaultValue="2026" maxLength={30} />
        </label>
      </div>
      <label>
        Texto oficial de Unidad 1
        <textarea
          name="content"
          required
          minLength={200}
          rows={10}
          placeholder="Pega aquí únicamente el contenido oficial de Unidad 1 - Doctrina Policial. No pegues notas personales ni contenido no verificado."
        />
      </label>
      <p className="muted small">
        El sistema divide el texto en fragmentos y los marca como fuente
        recuperable. No genera doctrina ni completa contenido faltante.
      </p>
      <Feedback state={state} />
      <button className="button primary" disabled={pending}>
        {pending ? <Upload size={17} /> : <FileText size={17} />}
        {pending ? "Cargando compendio…" : "Cargar Unidad 1"}
      </button>
    </form>
  );
}
