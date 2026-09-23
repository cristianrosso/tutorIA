"use client";

import { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpenCheck,
  Loader2,
  Mic,
  PauseCircle,
  Play,
  Square,
  Volume2,
} from "lucide-react";

type Unit = { id: string; number: number; name: string; enabled: boolean };
type Topic = {
  id: string;
  unitNumber: number;
  unitName: string;
  number: string;
  name: string;
};
type SessionStep = {
  id: string;
  stepOrder: number;
  stepType: string;
  title: string;
  content: string;
  checkQuestion?: string | null;
  status: string;
  sourceReferences: unknown[];
};
type Session = {
  id: string;
  unitNumber: number;
  topicLabel: string | null;
  classMode: "topic" | "unit" | "reinforcement";
  pedagogicalMode: "simple" | "academic" | "deep" | "review";
  interactionMode: "text" | "voice" | "mixed";
  status: string;
  currentStep: number;
  estimatedDurationMinutes: number;
  objectives: string[];
  completedSteps: number;
  totalSteps: number;
  steps: SessionStep[];
  feedback?: string;
};

export function GuidedClassPanel({
  units,
  topics,
}: {
  units: Unit[];
  topics: Topic[];
}) {
  const [unitNumber, setUnitNumber] = useState(1);
  const [topicId, setTopicId] = useState("");
  const [classMode, setClassMode] = useState<
    "topic" | "unit" | "reinforcement"
  >("topic");
  const [pedagogicalMode, setPedagogicalMode] = useState<
    "simple" | "academic" | "deep" | "review"
  >("simple");
  const [interactionMode, setInteractionMode] = useState<
    "text" | "voice" | "mixed"
  >("mixed");
  const [duration, setDuration] = useState<15 | 30 | 45 | 60>(30);
  const [session, setSession] = useState<Session | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [activeAudioKey, setActiveAudioKey] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioRequestRef = useRef(0);

  const unitTopics = useMemo(
    () => topics.filter((topic) => topic.unitNumber === unitNumber),
    [topics, unitNumber],
  );
  const selectedTopic = unitTopics.find((topic) => topic.id === topicId);
  const currentStep = session?.steps.at(-1);
  const waitingAnswer =
    session?.status === "awaiting_student_answer" && currentStep;

  async function startClass() {
    setLoading(true);
    setError("");
    setNotice("");
    setAnswer("");
    try {
      const response = await fetch("/api/classes/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitNumber,
          topicId: topicId || null,
          topicLabel: selectedTopic
            ? `${selectedTopic.number} ${selectedTopic.name}`
            : null,
          classMode,
          pedagogicalMode,
          interactionMode,
          estimatedDurationMinutes: duration,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "No se pudo iniciar la clase.");
      setSession(payload.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo iniciar la clase.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function postAction(action: "next" | "pause" | "resume" | "complete") {
    if (!session) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/classes/${session.id}/${action}`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "No se pudo actualizar la clase.");
      setSession(payload.session);
      setAnswer("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo actualizar la clase.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function sendAnswer(
    inputMode: "text" | "voice" = "text",
    text = answer,
  ) {
    if (!session || !currentStep) return;
    const clean = text.trim();
    if (clean.length < 2) {
      setError("Escribe o graba una respuesta breve.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/classes/${session.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: currentStep.id,
          answer: clean,
          inputMode,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "No se pudo registrar tu respuesta.");
      setSession(payload.session);
      setAnswer("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No se pudo registrar tu respuesta.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function play(text?: string, audioKey = "current") {
    if (!session || !text) return;
    if (voiceBusy) {
      if (activeAudioKey === audioKey) stopAudio();
      return;
    }
    stopAudio();
    const requestId = audioRequestRef.current + 1;
    audioRequestRef.current = requestId;
    setVoiceBusy(true);
    setActiveAudioKey(audioKey);
    setError("");
    try {
      const response = await fetch(`/api/classes/${session.id}/voice/speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: toSpeechText(text) }),
      });
      if (!response.ok) throw new Error("No se pudo generar audio.");
      const url = URL.createObjectURL(await response.blob());
      if (audioRequestRef.current !== requestId) {
        URL.revokeObjectURL(url);
        return;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (audioRequestRef.current === requestId) {
          setVoiceBusy(false);
          setActiveAudioKey(null);
          audioRef.current = null;
        }
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (audioRequestRef.current === requestId) {
          setVoiceBusy(false);
          setActiveAudioKey(null);
          audioRef.current = null;
          setError("No se pudo reproducir el audio.");
        }
      };
      await audio.play();
    } catch (caught) {
      if (audioRequestRef.current === requestId) {
        setVoiceBusy(false);
        setActiveAudioKey(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "No se pudo reproducir el audio.",
        );
      }
    }
  }

  function stopAudio() {
    audioRequestRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setVoiceBusy(false);
    setActiveAudioKey(null);
  }

  async function recordAnswer() {
    if (
      !session ||
      !navigator.mediaDevices?.getUserMedia ||
      !window.MediaRecorder
    ) {
      setError(
        "Tu navegador no permite grabación. Puedes responder por texto.",
      );
      return;
    }
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      setIsRecording(false);
      return;
    }
    setNotice("Grabando respuesta...");
    setError("");
    chunksRef.current = [];
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setNotice("");
      setIsRecording(false);
      setError(
        "No se pudo acceder al micrófono. Revisa el permiso del navegador.",
      );
      return;
    }
    streamRef.current = stream;
    const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      setNotice("Transcribiendo respuesta...");
      const blob = new Blob(chunksRef.current, { type: pickMimeType() });
      const form = new FormData();
      form.set(
        "audio",
        blob,
        `respuesta.${blob.type.includes("webm") ? "webm" : "mp4"}`,
      );
      form.set("duration", "8");
      try {
        const response = await fetch(
          `/api/classes/${session.id}/voice/transcribe`,
          { method: "POST", body: form },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error || "No se pudo transcribir.");
        setNotice(`Transcripción: ${payload.transcript}`);
        await sendAnswer("voice", payload.transcript);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "No se pudo transcribir.",
        );
      } finally {
        setNotice("");
        recorderRef.current = null;
        setIsRecording(false);
      }
    };
    recorderRef.current = recorder;
    setIsRecording(true);
    recorder.start();
  }

  return (
    <div className="classroom-layout">
      <section className="panel classroom-config">
        <div className="section-heading">
          <h2>Configurar clase</h2>
          <span>Generación incremental</span>
        </div>
        <div className="form-grid compact">
          <label>
            Unidad
            <select
              value={unitNumber}
              onChange={(e) => {
                setUnitNumber(Number(e.target.value));
                setTopicId("");
              }}
              disabled={loading}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.number}>
                  {unit.number}. {unit.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Modalidad
            <select
              value={classMode}
              onChange={(e) => setClassMode(e.target.value as typeof classMode)}
              disabled={loading}
            >
              <option value="topic">Por tema</option>
              <option value="unit">Por unidad</option>
              <option value="reinforcement">Refuerzo</option>
            </select>
          </label>
          <label>
            Tema
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={loading || classMode === "unit"}
            >
              <option value="">Tema principal disponible</option>
              {unitTopics.slice(0, 80).map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.number ? `${topic.number} · ` : ""}
                  {topic.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Duración
            <select
              value={duration}
              onChange={(e) =>
                setDuration(Number(e.target.value) as 15 | 30 | 45 | 60)
              }
              disabled={loading}
            >
              <option value={15}>15 minutos</option>
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>60 minutos</option>
            </select>
          </label>
          <label>
            Nivel
            <select
              value={pedagogicalMode}
              onChange={(e) =>
                setPedagogicalMode(e.target.value as typeof pedagogicalMode)
              }
              disabled={loading}
            >
              <option value="simple">Sencillo</option>
              <option value="academic">Académico</option>
              <option value="deep">Profundo</option>
              <option value="review">Repaso</option>
            </select>
          </label>
          <label>
            Interacción
            <select
              value={interactionMode}
              onChange={(e) =>
                setInteractionMode(e.target.value as typeof interactionMode)
              }
              disabled={loading}
            >
              <option value="mixed">Texto y voz</option>
              <option value="text">Texto</option>
              <option value="voice">Voz</option>
            </select>
          </label>
        </div>
        <button
          className="button primary"
          onClick={startClass}
          disabled={loading}
        >
          {loading && !session ? (
            <Loader2 size={16} className="spin-icon" />
          ) : (
            <BookOpenCheck size={16} />
          )}{" "}
          Iniciar clase guiada
        </button>
        {session ? (
          <div className="class-progress">
            <strong>
              {session.completedSteps}/{session.totalSteps}
            </strong>
            <span>pasos completados · estado {session.status}</span>
          </div>
        ) : null}
        {error ? <p className="notice error">{error}</p> : null}
        {notice ? <p className="notice">{notice}</p> : null}
      </section>

      <section className="panel classroom-room">
        {!session ? (
          <div className="chat-empty">
            <BookOpenCheck size={28} />
            <h3>Modo Clase</h3>
            <p>
              Selecciona una unidad o tema. El tutor desarrollará objetivos,
              explicación, ejemplo y preguntas de comprobación por etapas.
            </p>
          </div>
        ) : (
          <>
            <div className="section-heading">
              <div>
                <h2>{session.topicLabel || `Unidad ${session.unitNumber}`}</h2>
                <span>
                  {session.estimatedDurationMinutes} min ·{" "}
                  {session.pedagogicalMode} · {session.interactionMode}
                </span>
              </div>
              <div className="class-actions">
                <button
                  className="button secondary"
                  onClick={() =>
                    postAction(session.status === "paused" ? "resume" : "pause")
                  }
                  disabled={loading}
                >
                  {session.status === "paused" ? "Reanudar" : "Pausar"}
                </button>
                <button
                  className="button secondary"
                  onClick={() => postAction("complete")}
                  disabled={loading}
                >
                  Finalizar
                </button>
              </div>
            </div>
            <div className="objectives-card">
              <strong>Objetivos de aprendizaje</strong>
              <ul>
                {session.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            </div>
            <div className="class-step-list">
              {session.steps.map((step) => {
                const audioKey = `step:${step.id}`;
                const isStepAudioActive = activeAudioKey === audioKey;
                return (
                  <article className="class-step-card" key={step.id}>
                    <span className="eyebrow">
                      Paso {step.stepOrder} · {labelForStep(step.stepType)}
                    </span>
                    <h3>{step.title}</h3>
                    <div className="answer-text">{step.content}</div>
                    {step.checkQuestion ? (
                      <p className="notice">
                        <strong>Pregunta:</strong> {step.checkQuestion}
                      </p>
                    ) : null}
                    <button
                      className="button secondary"
                      onClick={() =>
                        isStepAudioActive
                          ? stopAudio()
                          : void play(
                              `${step.title}. ${step.content} ${step.checkQuestion || ""}`,
                              audioKey,
                            )
                      }
                      disabled={voiceBusy && !isStepAudioActive}
                    >
                      {isStepAudioActive ? (
                        <PauseCircle size={15} />
                      ) : (
                        <Volume2 size={15} />
                      )}{" "}
                      {isStepAudioActive ? "Detener" : "Escuchar"}
                    </button>
                  </article>
                );
              })}
            </div>
            {session.feedback ? (
              <article className="assessment-feedback positive">
                <strong>Retroalimentación</strong>
                <p>{session.feedback}</p>
              </article>
            ) : null}
            {waitingAnswer ? (
              <div className="class-answer-box">
                <label>
                  Tu respuesta de comprobación
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Responde con tus palabras..."
                  />
                </label>
                <div className="class-actions">
                  <button
                    className="button secondary"
                    onClick={recordAnswer}
                    disabled={loading}
                  >
                    {isRecording ? <Square size={15} /> : <Mic size={15} />}{" "}
                    Responder por voz
                  </button>
                  <button
                    className="button primary"
                    onClick={() => sendAnswer()}
                    disabled={loading || answer.trim().length < 2}
                  >
                    Enviar respuesta
                  </button>
                </div>
              </div>
            ) : (
              <div className="class-actions">
                <button
                  className="button primary"
                  onClick={() => postAction("next")}
                  disabled={loading || session.status === "completed"}
                >
                  {loading ? (
                    <Loader2 size={16} className="spin-icon" />
                  ) : (
                    <ArrowRight size={16} />
                  )}{" "}
                  Continuar
                </button>
                <button
                  className="button secondary"
                  onClick={() =>
                    currentStep
                      ? void play(
                          currentStep.content,
                          `repeat:${currentStep.id}`,
                        )
                      : undefined
                  }
                  disabled={
                    !currentStep ||
                    (voiceBusy && !activeAudioKey?.startsWith("repeat:"))
                  }
                >
                  <Play size={15} /> Repetir explicación
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function labelForStep(type: string) {
  if (type === "introduction") return "Introducción";
  if (type === "explanation") return "Explicación";
  if (type === "example") return "Ejemplo";
  if (type === "check_question") return "Comprobación";
  if (type === "summary") return "Síntesis";
  return type;
}
function toSpeechText(text: string) {
  const clean = text
    .replace(/\*\*/g, "")
    .replace(/[`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > 850
    ? `${clean.slice(0, 850)}. Puedes leer el resto en pantalla.`
    : clean;
}
function pickMimeType() {
  if (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
  )
    return "audio/webm;codecs=opus";
  if (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("audio/mp4")
  )
    return "audio/mp4";
  return "audio/webm";
}
