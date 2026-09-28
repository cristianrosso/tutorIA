"use client";

import { useActionState } from "react";
import { createProductAction, type ProductActionState } from "@/app/actions/products";

const initialState: ProductActionState = {};

export function ProductCreateForm() {
  const [state, action, pending] = useActionState(createProductAction, initialState);
  return (
    <form action={action} className="product-form">
      <div className="form-grid three">
        <label>
          Nombre público
          <input name="name" required minLength={3} placeholder="ESFM — Examen de Ascenso" />
        </label>
        <label>
          Nombre corto
          <input name="shortName" required minLength={2} placeholder="ESFM" />
        </label>
        <label>
          Slug técnico
          <input name="slug" required minLength={3} placeholder="esfm-ascenso" />
        </label>
        <label>
          Institución
          <input name="institutionName" placeholder="Institución académica" />
        </label>
        <label>
          Examen
          <input name="examName" placeholder="Examen de grado" />
        </label>
        <label>
          Gestión
          <input name="examYear" type="number" min={2000} max={2100} placeholder="2026" />
        </label>
        <label>
          Estado
          <select name="status" defaultValue="draft">
            <option value="draft">Borrador</option>
            <option value="active">Activo</option>
            <option value="suspended">Suspendido</option>
            <option value="archived">Archivado</option>
          </select>
        </label>
        <label>
          Color principal
          <input name="primaryColor" placeholder="#0f766e" />
        </label>
        <label>
          Color acento
          <input name="accentColor" placeholder="#e9c46a" />
        </label>
      </div>
      {state.error && <p className="notice error">{state.error}</p>}
      {state.success && <p className="notice success">{state.success}</p>}
      <button className="button primary" disabled={pending}>
        {pending ? "Creando..." : "Crear producto académico"}
      </button>
    </form>
  );
}
