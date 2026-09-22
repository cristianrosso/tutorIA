"use client";

import { PauseCircle, Play, Square } from "lucide-react";

type Props = {
  disabled?: boolean;
  isPlaying: boolean;
  canReplay: boolean;
  onPlay: () => void;
  onStop: () => void;
  label?: string;
};

export function VoicePlayer({
  disabled,
  isPlaying,
  canReplay,
  onPlay,
  onStop,
  label = "Escuchar",
}: Props) {
  return (
    <div className="voice-player-controls" aria-label="Reproductor de voz">
      <button
        className="button secondary"
        type="button"
        onClick={onPlay}
        disabled={disabled || isPlaying || !canReplay}
      >
        <Play size={16} /> {label}
      </button>
      <button
        className="button secondary"
        type="button"
        onClick={onStop}
        disabled={disabled || !isPlaying}
      >
        {isPlaying ? <PauseCircle size={16} /> : <Square size={16} />} Detener
      </button>
      <span>
        {isPlaying
          ? "Reproduciendo respuesta generada por IA."
          : "Audio disponible bajo demanda."}
      </span>
    </div>
  );
}
