"use client";

import { Loader2, Mic, Square, X } from "lucide-react";

export type VoiceRecorderState =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "processing"
  | "completed"
  | "error";

type Props = {
  state: VoiceRecorderState;
  durationSeconds: number;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
};

const labels: Record<VoiceRecorderState, string> = {
  idle: "LISTO PARA HABLAR",
  requesting_permission: "SOLICITANDO MICRÓFONO",
  recording: "ESCUCHANDO...",
  processing: "PROCESANDO...",
  completed: "TRANSCRIPCIÓN LISTA",
  error: "ERROR DE AUDIO",
};

export function VoiceRecorder({
  state,
  durationSeconds,
  disabled,
  onStart,
  onStop,
  onCancel,
}: Props) {
  const recording = state === "recording";
  const processing =
    state === "processing" || state === "requesting_permission";
  return (
    <div className="voice-recorder" aria-live="polite">
      <span
        className={`voice-status ${recording ? "listening" : processing ? "processing" : "ready"}`}
      >
        {labels[state]}
      </span>
      <button
        className={`mic-button ${recording ? "listening" : processing ? "processing" : "ready"}`}
        type="button"
        onClick={recording ? onStop : onStart}
        disabled={disabled || processing}
        aria-label={recording ? "Detener grabación" : "Iniciar grabación"}
      >
        {processing ? (
          <Loader2 className="spin-icon" size={38} />
        ) : recording ? (
          <Square size={34} />
        ) : (
          <Mic size={42} />
        )}
      </button>
      <div className="voice-actions">
        <button
          className="button secondary"
          type="button"
          onClick={onCancel}
          disabled={disabled || state === "idle"}
        >
          <X size={16} /> Cancelar
        </button>
        <span>{durationSeconds}s</span>
      </div>
    </div>
  );
}
