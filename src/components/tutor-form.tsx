"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Loader2,
  Mic,
  PauseCircle,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { TutorChat } from "@/components/tutor/tutor-chat";

type VoiceStatus = "ready" | "listening" | "processing" | "speaking";

type Source = {
  title: string;
  source: string;
  unitName?: string;
  section: string | null;
  sectionName: string | null;
  page: number | null;
  score: number;
};

type VoiceResponse = {
  conversationId: string;
  transcript: string;
  answer: string;
  sources: Source[];
  models?: { stt?: string; tutor?: string };
  usage?: { audioInputSeconds?: number };
};

const statusLabel: Record<VoiceStatus, string> = {
  ready: "LISTO PARA HABLAR",
  listening: "ESCUCHANDO...",
  processing: "PROCESANDO...",
  speaking: "RESPONDIENDO...",
};

const maxRecordingMs = 65_000;
const minRecordingMs = 900;

export function TutorForm({
  unit,
  section,
  initialConversationId,
  initialMessages,
}: {
  unit: { number: number; name: string };
  section?: string;
  initialConversationId?: string;
  initialMessages?: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    usage?: {
      model: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCost: number;
    };
  }>;
}) {
  const [status, setStatus] = useState<VoiceStatus>("ready");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceResponse | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [audioSeconds, setAudioSeconds] = useState<number | null>(null);
  const [ttsModel, setTtsModel] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const speechRef = useRef<{
    stop: () => void;
    abort?: () => void;
  } | null>(null);
  const speechTranscriptRef = useRef("");

  useEffect(() => {
    const cachedAudio = cacheRef.current;
    return () => {
      stopTracks();
      stopBrowserSpeech();
      stopAudio();
      for (const url of cachedAudio.values()) URL.revokeObjectURL(url);
      abortRef.current?.abort();
    };
  }, []);

  const active = status !== "ready";
  const answer = voice?.answer;
  const question = voice?.transcript;
  const sources = voice?.sources;
  const currentStatus = useMemo(() => statusLabel[status], [status]);

  async function startRecording() {
    setVoiceError(null);
    setPlaybackUrl(null);
    stopAudio();
    if (!window.isSecureContext) {
      setVoiceError(
        "Chrome puede bloquear el micrófono en una dirección no segura. Para teléfono Android usa HTTPS, un túnel seguro o prueba desde localhost.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceError(
        "Tu navegador no permite grabación de audio. En Android usa Chrome actualizado y permite el micrófono.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      speechTranscriptRef.current = "";
      startBrowserSpeech();
      const recorder = new MediaRecorder(stream, {
        mimeType: pickMimeType(),
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopTracks();
        void submitRecording();
      };
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setStatus("listening");
      recorder.start(250);
      window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") stopRecording();
      }, maxRecordingMs);
    } catch {
      setStatus("ready");
      setVoiceError(
        "No pude acceder al micrófono. Revisa el permiso del navegador e inténtalo de nuevo.",
      );
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      setStatus("processing");
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
    stopBrowserSpeech();
  }

  function cancelRecording() {
    abortRef.current?.abort();
    chunksRef.current = [];
    recordingStartedAtRef.current = 0;
    speechTranscriptRef.current = "";
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    stopTracks();
    stopBrowserSpeech();
    stopAudio();
    setStatus("ready");
    setVoiceError("Grabación cancelada.");
  }

  async function submitRecording() {
    const durationMs = recordingStartedAtRef.current
      ? Date.now() - recordingStartedAtRef.current
      : 0;
    recordingStartedAtRef.current = 0;
    if (chunksRef.current.length === 0) {
      const fallback = speechTranscriptRef.current.trim();
      if (fallback.length >= 3) {
        await submitBrowserTranscript(fallback, durationMs);
        return;
      }
      setStatus("ready");
      setVoiceError(
        "No llegó audio suficiente desde el micrófono. Espera que diga ESCUCHANDO y habla al menos 3 segundos.",
      );
      return;
    }
    const blob = new Blob(chunksRef.current, { type: pickMimeType() });
    chunksRef.current = [];
    if (durationMs < minRecordingMs && blob.size < 900) {
      const fallback = speechTranscriptRef.current.trim();
      if (fallback.length >= 3) {
        await submitBrowserTranscript(fallback, durationMs);
        return;
      }
      setStatus("ready");
      setVoiceError(
        "La grabación fue demasiado breve. Espera que diga ESCUCHANDO y habla al menos 3 segundos.",
      );
      return;
    }
    if (blob.size < 900) {
      const fallback = speechTranscriptRef.current.trim();
      if (fallback.length >= 3) {
        await submitBrowserTranscript(fallback, durationMs);
        return;
      }
      setStatus("ready");
      setVoiceError(
        `El navegador entregó un audio demasiado pequeño (${blob.size} bytes). Revisa que el micrófono correcto esté permitido y habla más cerca del equipo.`,
      );
      return;
    }
    const form = new FormData();
    form.set(
      "audio",
      blob,
      `pregunta.${blob.type.includes("webm") ? "webm" : "mp4"}`,
    );
    form.set("duration", String(Math.round(durationMs / 1000)));
    if (voice?.conversationId) form.set("conversationId", voice.conversationId);
    form.set("unitNumber", String(unit.number));
    if (section) form.set("section", section);
    abortRef.current = new AbortController();
    try {
      const started = performance.now();
      const response = await fetch("/api/tutor/voice/respond", {
        method: "POST",
        body: form,
        signal: abortRef.current.signal,
      });
      const payload = (await response.json()) as VoiceResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error);
      setVoice(payload);
      await playAnswer(payload.answer, payload.conversationId, started);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setVoiceError(
          error instanceof Error && error.message
            ? error.message
            : "No se pudo procesar tu audio. Revisa la conexión e inténtalo nuevamente.",
        );
      }
      setStatus("ready");
    }
  }

  async function submitBrowserTranscript(text: string, durationMs: number) {
    try {
      setStatus("processing");
      const started = performance.now();
      const response = await fetch("/api/tutor/voice/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: text,
          conversationId: voice?.conversationId,
          duration: Math.round(durationMs / 1000),
          unitNumber: unit.number,
          section,
        }),
      });
      const payload = (await response.json()) as VoiceResponse & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error);
      setVoice(payload);
      await playAnswer(payload.answer, payload.conversationId, started);
    } catch (error) {
      setStatus("ready");
      setVoiceError(
        error instanceof Error && error.message
          ? error.message
          : "El navegador reconoció texto, pero no se pudo consultar el tutor.",
      );
    }
  }

  async function playAnswer(
    text: string,
    conversationId: string,
    started: number,
  ) {
    const cacheKey = `${conversationId}:${text}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      startAudio(cached);
      return;
    }
    setStatus("speaking");
    const response = await fetch("/api/tutor/voice/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, text }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        payload.error || "No se pudo generar el audio de respuesta.",
      );
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    cacheRef.current.set(cacheKey, url);
    setAudioSeconds(Number(response.headers.get("X-Audio-Seconds")) || null);
    setTtsModel(response.headers.get("X-OpenAI-Model"));
    setPlaybackUrl(url);
    startAudio(url);
    const latencySeconds = ((performance.now() - started) / 1000).toFixed(1);
    console.info(`Respuesta de voz lista en ${latencySeconds}s`);
  }

  function startAudio(url: string) {
    stopAudio(false);
    setStatus("speaking");
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setStatus("ready");
    audio.onerror = () => {
      setStatus("ready");
      setVoiceError(
        "No se pudo reproducir el audio. Puedes leer la respuesta.",
      );
    };
    void audio.play().catch(() => {
      setStatus("ready");
      setVoiceError(
        "El navegador bloqueó la reproducción automática. Pulsa escuchar respuesta.",
      );
    });
  }

  function stopAudio(resetStatus = true) {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (resetStatus) setStatus("ready");
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function startBrowserSpeech() {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    try {
      const recognition = new Recognition();
      recognition.lang = "es-BO";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let text = "";
        for (let index = 0; index < event.results.length; index += 1) {
          text += event.results[index]?.[0]?.transcript || "";
        }
        speechTranscriptRef.current = text.trim();
      };
      recognition.start();
      speechRef.current = recognition;
    } catch {
      speechRef.current = null;
    }
  }

  function stopBrowserSpeech() {
    try {
      speechRef.current?.stop();
    } catch {}
    speechRef.current = null;
  }

  return (
    <div className="tutor-workspace voice-enabled">
      <section className="voice-panel" aria-live="polite">
        <span className={`voice-status ${status}`}>{currentStatus}</span>
        <button
          className={`mic-button ${status}`}
          type="button"
          onClick={status === "listening" ? stopRecording : startRecording}
          disabled={status === "processing" || status === "speaking"}
          aria-label={
            status === "listening" ? "Detener grabación" : "Iniciar grabación"
          }
        >
          {status === "processing" ? (
            <Loader2 className="spin-icon" size={38} />
          ) : status === "listening" ? (
            <Square size={34} />
          ) : (
            <Mic size={42} />
          )}
        </button>
        <div className="voice-actions">
          <button
            className="button secondary"
            type="button"
            onClick={cancelRecording}
            disabled={!active}
          >
            <X size={16} />
            Cancelar
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() =>
              playbackUrl && voice
                ? void playAnswer(
                    voice.answer,
                    voice.conversationId,
                    performance.now(),
                  )
                : undefined
            }
            disabled={!playbackUrl || status === "speaking"}
          >
            <Volume2 size={16} />
            Escuchar
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => stopAudio()}
            disabled={status !== "speaking"}
          >
            <PauseCircle size={16} />
            Detener voz
          </button>
        </div>
        <p className="voice-help">
          Habla una intervención breve. El micrófono se apaga al detener y el
          tutor conserva solo el contexto necesario para repreguntas.
        </p>
        {voiceError && (
          <p className="notice error" role="alert">
            {voiceError}
          </p>
        )}
        {voice && (
          <div className="voice-metrics">
            <span>STT: {voice.models?.stt || "OpenAI"}</span>
            <span>Tutor: {voice.models?.tutor || "OpenAI"}</span>
            {ttsModel && <span>TTS: {ttsModel}</span>}
            {voice.usage?.audioInputSeconds ? (
              <span>Entrada: {voice.usage.audioInputSeconds}s</span>
            ) : null}
            {audioSeconds ? <span>Salida aprox.: {audioSeconds}s</span> : null}
          </div>
        )}
      </section>

      {answer ? (
        <section className="tutor-answer" aria-live="polite">
          <div className="chat-bubble user">
            <strong>Tú</strong>
            <p>{question}</p>
          </div>
          <article className="chat-bubble assistant">
            <span className="eyebrow">RESPUESTA DIDÁCTICA POR VOZ</span>
            <div className="answer-text">{answer}</div>
          </article>
          <SourceList sources={sources || []} />
        </section>
      ) : null}

      <TutorChat
        unit={unit}
        initialConversationId={initialConversationId}
        initialMessages={initialMessages}
      />
    </div>
  );
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <section className="source-list">
      <h2>
        <BookOpen size={18} /> Fuentes recuperadas
      </h2>
      {sources.length ? (
        sources.map((source, index) => (
          <article key={`${source.title}-${index}`}>
            <strong>
              Fuente {index + 1}: {source.title}
            </strong>
            <span>{source.source}</span>
            <p>
              {source.unitName ? `${source.unitName}. ` : ""}
              {source.section
                ? `Sección ${source.section}${source.sectionName ? ` · ${source.sectionName}` : ""}`
                : "Fragmento del compendio"}
              {source.page ? ` · Página ${source.page}` : ""}
            </p>
          </article>
        ))
      ) : (
        <p>
          No se recuperaron fuentes. La respuesta se abstuvo de inventar
          contenido académico.
        </p>
      )}
    </section>
  );
}

function pickMimeType() {
  if (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
  ) {
    return "audio/webm;codecs=opus";
  }
  if (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("audio/mp4")
  ) {
    return "audio/mp4";
  }
  return "audio/webm";
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
