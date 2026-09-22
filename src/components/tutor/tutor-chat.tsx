"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Bot,
  Loader2,
  Mic,
  PauseCircle,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  X,
} from "lucide-react";

type Source = {
  unitNumber: number | null;
  unitName: string | null;
  topicName: string | null;
  sectionName: string | null;
  reference: string | null;
  score: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  usage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
  suggestedFollowUps?: string[];
};

type TutorMode =
  | "normal"
  | "quick"
  | "explain"
  | "simple"
  | "academic"
  | "deep"
  | "example"
  | "review"
  | "comparison"
  | "step_by_step";

type TutorChatResponse = {
  conversationId: string;
  messageId: string;
  answer: string;
  intent: string;
  mode: TutorMode;
  strategy: string;
  sources: Source[];
  suggestedFollowUps: string[];
  usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
  error?: string;
};

type VoiceStatus = "ready" | "listening" | "processing" | "speaking";

const maxRecordingMs = 65_000;
const minRecordingMs = 900;

const modeOptions: Array<{ value: TutorMode; label: string; help: string }> = [
  { value: "normal", label: "Normal", help: "Respuesta equilibrada." },
  { value: "quick", label: "Rápido", help: "Breve y directo." },
  {
    value: "simple",
    label: "Sencillo",
    help: "Lenguaje fácil sin perder el concepto.",
  },
  {
    value: "academic",
    label: "Académico",
    help: "Formal, con elementos y aplicación.",
  },
  { value: "deep", label: "Profundo", help: "Mayor desarrollo y relaciones." },
  {
    value: "example",
    label: "Ejemplo",
    help: "Ejemplo didáctico contextualizado.",
  },
  { value: "review", label: "Repaso", help: "Preparación para examen." },
  {
    value: "comparison",
    label: "Comparación",
    help: "Semejanzas y diferencias.",
  },
  {
    value: "step_by_step",
    label: "Paso a paso",
    help: "Procesos, fases o procedimientos.",
  },
];

export function TutorChat({
  unit,
  initialConversationId,
  initialMessages,
}: {
  unit: { number: number; name: string };
  initialConversationId?: string;
  initialMessages?: ChatMessage[];
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(
    initialConversationId || "",
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages || [],
  );
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<TutorMode>("normal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("ready");
  const [voiceConversationMode, setVoiceConversationMode] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [playingMessageId, setPlayingMessageId] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const localMessageIdRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingStoppedAtRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  async function submit(
    text = message,
    overrideMode?: TutorMode,
    speakAnswer = false,
  ) {
    const clean = text.trim();
    if (clean.length < 3 || pending) return null;
    setError(null);
    setPending(true);
    setMessage("");
    localMessageIdRef.current += 1;
    const localUser: ChatMessage = {
      id: `local-${localMessageIdRef.current}`,
      role: "user",
      content: clean,
    };
    setMessages((current) => [...current, localUser]);
    try {
      const response = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId || undefined,
          message: clean,
          mode: overrideMode || mode,
          unitNumber: unit.number,
        }),
      });
      const payload = (await response.json()) as TutorChatResponse;
      if (!response.ok)
        throw new Error(payload.error || "No se pudo consultar el tutor.");
      setConversationId(payload.conversationId);
      setMessages((current) => [
        ...current,
        {
          id: payload.messageId,
          role: "assistant",
          content: payload.answer,
          sources: payload.sources,
          usage: payload.usage,
          suggestedFollowUps: payload.suggestedFollowUps,
        },
      ]);
      if (speakAnswer) {
        await playAssistantAudio(
          payload.messageId,
          payload.answer,
          payload.conversationId,
        );
      }
      return payload;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pude completar la consulta en este momento.",
      );
      return null;
    } finally {
      setPending(false);
    }
  }

  async function startVoiceRecording(startedAt: number) {
    setVoiceError(null);
    stopAudio();
    if (!window.isSecureContext) {
      setVoiceError(
        "Para usar micrófono en celular necesitas HTTPS. Usa la URL de Vercel.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceError(
        "Tu navegador no permite grabación de audio. Usa Chrome actualizado o escribe tu pregunta.",
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
      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void submitVoiceRecording();
      };
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = startedAt;
      recordingStoppedAtRef.current = 0;
      setVoiceStatus("listening");
      recorder.start(250);
      window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording")
          stopVoiceRecording(recordingStartedAtRef.current + maxRecordingMs);
      }, maxRecordingMs);
    } catch {
      setVoiceStatus("ready");
      setVoiceError(
        "No pude acceder al micrófono. Revisa permisos del navegador.",
      );
    }
  }

  function stopVoiceRecording(stoppedAt = 0) {
    if (mediaRecorderRef.current?.state === "recording") {
      recordingStoppedAtRef.current =
        stoppedAt || recordingStartedAtRef.current + maxRecordingMs;
      setVoiceStatus("processing");
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
  }

  function cancelVoiceRecording() {
    chunksRef.current = [];
    recordingStartedAtRef.current = 0;
    recordingStoppedAtRef.current = 0;
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    stopRecordingResources();
    setVoiceStatus("ready");
    setVoiceError("Grabación cancelada.");
  }

  function stopRecordingResources() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }

  async function submitVoiceRecording() {
    const durationMs =
      recordingStartedAtRef.current && recordingStoppedAtRef.current
        ? Math.max(
            0,
            recordingStoppedAtRef.current - recordingStartedAtRef.current,
          )
        : 0;
    recordingStartedAtRef.current = 0;
    recordingStoppedAtRef.current = 0;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    stopRecordingResources();
    if (durationMs < minRecordingMs || chunks.length === 0) {
      setVoiceStatus("ready");
      setVoiceError(
        "No llegó audio suficiente. Habla al menos unos segundos y vuelve a intentar.",
      );
      return;
    }
    const blob = new Blob(chunks, { type: pickMimeType() });
    if (blob.size < 900) {
      setVoiceStatus("ready");
      setVoiceError(
        "El audio fue demasiado pequeño. Habla más cerca del micrófono o escribe tu pregunta.",
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
    try {
      const response = await fetch("/api/tutor/voice/transcribe", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as {
        transcript?: string;
        error?: string;
      };
      if (!response.ok || !payload.transcript)
        throw new Error(payload.error || "No se pudo transcribir.");
      if (voiceConversationMode) {
        const result = await submit(payload.transcript, undefined, true);
        if (!result) setVoiceStatus("ready");
      } else {
        setMessage(payload.transcript);
        setVoiceStatus("ready");
      }
    } catch (caught) {
      setVoiceStatus("ready");
      setVoiceError(
        caught instanceof Error
          ? caught.message
          : "No se pudo procesar el audio.",
      );
    }
  }

  async function playAssistantAudio(
    messageId: string,
    text: string,
    targetConversationId = conversationId,
  ) {
    if (!targetConversationId) return;
    const cacheKey = `${targetConversationId}:${messageId}:${text}`;
    if (playingMessageId === messageId) {
      stopAudio();
      return;
    }
    try {
      setPlayingMessageId(messageId);
      setVoiceStatus("speaking");
      let url = audioCacheRef.current.get(cacheKey);
      if (!url) {
        const response = await fetch("/api/tutor/voice/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: targetConversationId, text }),
        });
        if (!response.ok) throw new Error("No se pudo generar audio.");
        url = URL.createObjectURL(await response.blob());
        audioCacheRef.current.set(cacheKey, url);
      }
      stopAudio(false);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingMessageId("");
        setVoiceStatus("ready");
      };
      audio.onerror = () => {
        setPlayingMessageId("");
        setVoiceStatus("ready");
        setVoiceError(
          "No se pudo reproducir el audio. Puedes leer la respuesta.",
        );
      };
      await audio.play();
    } catch (caught) {
      setPlayingMessageId("");
      setVoiceStatus("ready");
      setVoiceError(
        caught instanceof Error
          ? caught.message
          : "No se pudo reproducir el audio.",
      );
    }
  }

  function stopAudio(reset = true) {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (reset) {
      setPlayingMessageId("");
      if (voiceStatus === "speaking") setVoiceStatus("ready");
    }
  }

  useEffect(() => {
    const audioCache = audioCacheRef.current;
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      mediaRecorderRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      for (const url of audioCache.values()) URL.revokeObjectURL(url);
    };
  }, []);

  function newConversation() {
    stopAudio();
    stopRecordingResources();
    chunksRef.current = [];
    recordingStartedAtRef.current = 0;
    recordingStoppedAtRef.current = 0;
    setVoiceStatus("ready");
    setVoiceError(null);
    setConversationId("");
    setMessages([]);
    setMessage("");
    setError(null);
  }

  return (
    <section className="chat-panel panel">
      <div className="section-heading">
        <div>
          <h2>Chat pedagógico</h2>
          <span>
            Unidad {unit.number} · {unit.name}
          </span>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={newConversation}
        >
          Nueva conversación
        </button>
      </div>

      <div className="mode-selector" aria-label="Modo pedagógico del tutor">
        <label htmlFor="pedagogical-mode">Modo de explicación</label>
        <select
          id="pedagogical-mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as TutorMode)}
        >
          {modeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span>{modeOptions.find((option) => option.value === mode)?.help}</span>
      </div>

      <div className="mode-row" aria-label="Accesos rápidos de modo">
        {modeOptions.slice(1).map((option) => (
          <button
            className={`mode-pill ${mode === option.value ? "active" : ""}`}
            key={option.value}
            type="button"
            onClick={() => setMode(option.value)}
            title={option.help}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="chat-voice-row" aria-live="polite">
        <div>
          <strong>Conversación por voz</strong>
          <span>
            {voiceConversationMode
              ? "Habla y el tutor responderá automáticamente por voz."
              : "Habla y revisa la transcripción antes de enviarla."}
          </span>
        </div>
        <label>
          <input
            type="checkbox"
            checked={voiceConversationMode}
            onChange={(event) => setVoiceConversationMode(event.target.checked)}
          />
          Fluida
        </label>
        <button
          className="button secondary"
          type="button"
          onClick={
            voiceStatus === "listening"
              ? (event) => stopVoiceRecording(event.timeStamp)
              : (event) => void startVoiceRecording(event.timeStamp)
          }
          disabled={
            pending ||
            voiceStatus === "processing" ||
            voiceStatus === "speaking"
          }
        >
          {voiceStatus === "processing" ? (
            <Loader2 size={16} className="spin-icon" />
          ) : voiceStatus === "listening" ? (
            <Square size={16} />
          ) : (
            <Mic size={16} />
          )}
          {voiceStatus === "processing"
            ? "Transcribiendo..."
            : voiceStatus === "listening"
              ? "Detener"
              : "Hablar"}
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={
            voiceStatus === "speaking"
              ? () => stopAudio()
              : cancelVoiceRecording
          }
          disabled={voiceStatus === "ready"}
        >
          {voiceStatus === "speaking" ? (
            <PauseCircle size={16} />
          ) : (
            <X size={16} />
          )}
          {voiceStatus === "speaking" ? "Detener voz" : "Cancelar"}
        </button>
      </div>

      {voiceError && <p className="notice error">{voiceError}</p>}

      <div className="chat-thread" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <Bot size={26} />
            <h3>Pregunta como hablarías con un profesor.</h3>
            <p>
              El tutor usará el motor RAG académico MKF-1, conservará contexto y
              mostrará fuentes del compendio.
            </p>
          </div>
        )}
        {messages.map((item) => (
          <article className={`chat-bubble ${item.role}`} key={item.id}>
            <strong>{item.role === "user" ? "Tú" : "Tutor IA"}</strong>
            <div className="answer-text">{item.content}</div>
            {item.role === "assistant" && (
              <>
                <SourceSummary sources={item.sources || []} />
                <div className="message-actions">
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => void sendFeedback(item.id, "up")}
                    aria-label="Respuesta útil"
                  >
                    <ThumbsUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => void sendFeedback(item.id, "down")}
                    aria-label="Respuesta no útil"
                  >
                    <ThumbsDown size={16} />
                  </button>
                  {item.usage && (
                    <small>
                      {item.usage.model} ·{" "}
                      {item.usage.inputTokens + item.usage.outputTokens} tokens
                    </small>
                  )}
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      void playAssistantAudio(item.id, item.content)
                    }
                  >
                    {playingMessageId === item.id ? (
                      <PauseCircle size={15} />
                    ) : (
                      <Volume2 size={15} />
                    )}
                    {playingMessageId === item.id ? "Detener" : "Escuchar"}
                  </button>
                </div>
                {item.suggestedFollowUps?.length ? (
                  <div className="follow-up-row">
                    {item.suggestedFollowUps.map((followUp) => (
                      <button
                        className="button secondary"
                        type="button"
                        key={followUp}
                        onClick={() =>
                          void submit(followUp, modeForFollowUp(followUp))
                        }
                      >
                        {followUp}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="follow-up-row">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => router.push(`/practica?unit=${unit.number}`)}
                  >
                    Practicar este tema
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
        {pending && (
          <div className="chat-thinking">
            <Loader2 className="spin-icon" size={18} /> Tutor está pensando…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="notice error">{error}</p>}

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          maxLength={1200}
          placeholder="Ej. ¿Qué es archivística?"
        />
        <button
          className="button primary"
          disabled={pending || message.trim().length < 3}
        >
          <Send size={17} /> Enviar
        </button>
      </form>
    </section>
  );
}

async function sendFeedback(messageId: string, rating: "up" | "down") {
  await fetch("/api/tutor/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, rating }),
  }).catch(() => null);
}

function SourceSummary({ sources }: { sources: Source[] }) {
  return (
    <div className="chat-sources">
      <strong>
        <BookOpen size={16} /> Fuente
      </strong>
      {sources.length ? (
        sources.slice(0, 3).map((source, index) => (
          <p key={`${source.reference}-${index}`}>
            Compendio FATESCIPOL 2026 ·{" "}
            {source.unitNumber ? `Unidad ${source.unitNumber}` : "Unidad"}
            {source.unitName ? ` - ${source.unitName}` : ""}
            {source.topicName ? ` · ${source.topicName}` : ""}
            {source.sectionName ? ` · ${source.sectionName}` : ""}
          </p>
        ))
      ) : (
        <p>No se recuperó una fuente suficiente del compendio.</p>
      )}
    </div>
  );
}

function modeForFollowUp(text: string): TutorMode | undefined {
  if (/f[aá]cil|claro|no entend/i.test(text)) return "simple";
  if (/ejemplo|caso/i.test(text)) return "example";
  if (/profundiza|m[aá]s/i.test(text)) return "deep";
  if (/tabla|compar/i.test(text)) return "comparison";
  if (/paso|secuencia|ord[eé]name/i.test(text)) return "step_by_step";
  if (/preg[uú]ntame|examen|respuesta modelo|repaso/i.test(text))
    return "review";
  return undefined;
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
