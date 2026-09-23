"use client";

import { useActionState } from "react";
import { BookOpen, FileUp, RefreshCcw, Rocket, RotateCcw } from "lucide-react";
import {
  processKnowledgeVersionAction,
  publishKnowledgeVersionAction,
  rollbackKnowledgeVersionAction,
  uploadKnowledgeDocumentAction,
} from "@/app/actions/knowledge";

type ActionState = { ok: boolean; message: string; documentId?: string };
const initialState: ActionState = { ok: false, message: "" };

export function KnowledgeUploadForm() {
  const [state, action, pending] = useActionState(
    uploadKnowledgeDocumentAction as (state: ActionState, form: FormData) => Promise<ActionState>,
    initialState,
  );
  return (
    <form className="admin-form knowledge-upload-form" action={action}>
      <div className="form-grid compact">
        <label>
          Título académico
          <input name="title" required minLength={3} placeholder="Compendio FATESCIPOL 2026" />
        </label>
        <label>
          Versión
          <input name="versionLabel" required defaultValue="v1" />
        </label>
      </div>
      <label>
        Descripción
        <textarea name="description" rows={3} placeholder="Notas internas para revisión administrativa" />
      </label>
      <div className="form-grid compact">
        <label>
          Fuente
          <input
            name="sourceLabel"
            required
            defaultValue="Compendio FATESCIPOL El Alto – Examen de Grado 2026"
          />
        </label>
        <label>
          Tipo
          <select name="documentKind" defaultValue="COMPENDIUM">
            <option value="COMPENDIUM">Compendio</option>
            <option value="SUPPLEMENT">Complemento</option>
            <option value="CORRECTION">Corrección</option>
            <option value="OTHER">Otro</option>
          </select>
        </label>
      </div>
      <div className="form-grid compact">
        <label>
          Unidad relacionada
          <select name="unitNumber" defaultValue="">
            <option value="">Documento general</option>
            {Array.from({ length: 15 }, (_, index) => index + 1).map((unit) => (
              <option key={unit} value={unit}>Unidad {unit}</option>
            ))}
          </select>
        </label>
        <label>
          Número de tema
          <input name="topicNumber" placeholder="Ej. 1.2" />
        </label>
        <label>
          Nombre de tema
          <input name="topicName" placeholder="Ej. Doctrina Policial" />
        </label>
      </div>
      <label>
        Archivo académico privado
        <input name="file" type="file" accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required />
      </label>
      <button className="button primary" disabled={pending}>
        <FileUp size={17} /> {pending ? "Cargando…" : "Cargar documento"}
      </button>
      {state.message && <p className={`notice ${state.ok ? "success" : "error"}`}>{state.message}</p>}
      {state.documentId && (
        <a className="button secondary" href={`/admin/knowledge/documents/${state.documentId}`}>
          <BookOpen size={16} /> Abrir documento cargado
        </a>
      )}
    </form>
  );
}

function VersionActionButton({
  action,
  label,
  icon,
  versionId,
  documentId,
  disabled,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  label: string;
  icon: "process" | "publish" | "rollback";
  versionId: string;
  documentId: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const Icon = icon === "process" ? RefreshCcw : icon === "publish" ? Rocket : RotateCcw;
  return (
    <form action={formAction} className="inline-action-form">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="documentId" value={documentId} />
      <button className={`button ${icon === "rollback" ? "danger-button" : icon === "publish" ? "primary" : "secondary"}`} disabled={pending || disabled}>
        <Icon size={15} /> {pending ? "Trabajando…" : label}
      </button>
      {state.message && <small className={state.ok ? "inline-success" : "inline-error"}>{state.message}</small>}
    </form>
  );
}

export function KnowledgeVersionActions({
  versionId,
  documentId,
  status,
  hasAcademicDocument,
}: {
  versionId: string;
  documentId: string;
  status: string;
  hasAcademicDocument: boolean;
}) {
  return (
    <div className="knowledge-version-actions">
      <VersionActionButton
        action={processKnowledgeVersionAction}
        label="Procesar"
        icon="process"
        versionId={versionId}
        documentId={documentId}
        disabled={status === "processing" || status === "published"}
      />
      <VersionActionButton
        action={publishKnowledgeVersionAction}
        label="Publicar al RAG"
        icon="publish"
        versionId={versionId}
        documentId={documentId}
        disabled={!(status === "processed" || status === "review_required")}
      />
      <VersionActionButton
        action={rollbackKnowledgeVersionAction}
        label="Revertir"
        icon="rollback"
        versionId={versionId}
        documentId={documentId}
        disabled={!hasAcademicDocument || status === "rolled_back"}
      />
    </div>
  );
}
