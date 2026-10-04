"use client";

import { useActionState, useState } from "react";
import { BookOpen, FileUp, RefreshCcw, Rocket, RotateCcw } from "lucide-react";
import type { AcademicProduct } from "@/lib/products/products";
import {
  processKnowledgeVersionAction,
  publishKnowledgeVersionAction,
  rollbackKnowledgeVersionAction,
  uploadKnowledgeDocumentAction,
} from "@/app/actions/knowledge";

type ActionState = { ok: boolean; message: string; documentId?: string };
const initialState: ActionState = { ok: false, message: "" };
const MAX_KNOWLEDGE_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_KNOWLEDGE_UPLOAD_MB = Math.floor(MAX_KNOWLEDGE_UPLOAD_BYTES / 1024 / 1024);

export function KnowledgeUploadForm({ products = [] }: { products?: AcademicProduct[] }) {
  const [clientError, setClientError] = useState("");
  const [state, action, pending] = useActionState(
    uploadKnowledgeDocumentAction as (state: ActionState, form: FormData) => Promise<ActionState>,
    initialState,
  );
  return (
    <form
      className="admin-form knowledge-upload-form"
      action={action}
      onSubmit={(event) => {
        const fileInput = event.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
        const file = fileInput?.files?.[0];
        if (file && file.size > MAX_KNOWLEDGE_UPLOAD_BYTES) {
          event.preventDefault();
          setClientError(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El límite actual es ${MAX_KNOWLEDGE_UPLOAD_MB} MB.`);
          return;
        }
        setClientError("");
      }}
    >
      <div className="form-grid compact">
        <label>
          Curso / producto
          <select name="productId" required defaultValue={products[0]?.id || ""}>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.short_name} · {product.name}
              </option>
            ))}
          </select>
        </label>
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
          Asignatura / materia relacionada
          <select name="unitNumber" defaultValue="">
            <option value="">Asignar número automáticamente</option>
            {Array.from({ length: 30 }, (_, index) => index + 1).map((unit) => (
              <option key={unit} value={unit}>Asignatura {unit}</option>
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
        <input
          name="file"
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file && file.size > MAX_KNOWLEDGE_UPLOAD_BYTES) {
              setClientError(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El límite actual es ${MAX_KNOWLEDGE_UPLOAD_MB} MB.`);
            } else {
              setClientError("");
            }
          }}
        />
        <small>PDF, DOCX o TXT. Límite actual: {MAX_KNOWLEDGE_UPLOAD_MB} MB por archivo.</small>
      </label>
      <button className="button primary" disabled={pending}>
        <FileUp size={17} /> {pending ? "Cargando…" : "Cargar documento"}
      </button>
      {clientError && <p className="notice error">{clientError}</p>}
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
      {state.message && !state.ok && <small className="inline-error">{state.message}</small>}
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
        disabled={!(status === "processed" || status === "review_required" || status === "published")}
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

