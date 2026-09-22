"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Mic,
  PauseCircle,
  RotateCcw,
  Save,
  Send,
  Square,
  Volume2,
  XCircle,
} from "lucide-react";
import type { PublicExamQuestion, PublicExamSession } from "@/lib/exams/types";

type UnitOption = { id: string; number: number; name: string };
type TopicOption = {
  id: string;
  unitId: string;
  number: string | null;
  name: string;
};
type Props = {
  units: UnitOption[];
  topics: TopicOption[];
  initialUnit?: number;
};

type Feedback = {
  result?: string;
  score?: number;
  maxScore?: number;
  correction?: string;
  correctAnswer?: string;
  explanation?: string;
  whatWasGood?: string[];
  missingConcepts?: string[];
  reinforce?: string[];
  sourceReferences?: string[];
};

type VoiceTranscription = {
  transcript: string;
  model?: string;
  audioInputSeconds?: number;
  error?: string;
};

const modeLabels: Record<string, string> = {
  unit: "Por unidad",
  topic: "Por tema",
  integral: "Integral",
  tribunal: "Tribunal oral",
};
const questionTypeLabels: Record<string, string> = {
  open_answer: "Pregunta abierta de tribunal",
};
const difficultyLabels: Record<string, string> = {
  mixed: "Mixto",
  basic: "Básico",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};
const durationOptions = [0, 15, 30, 60, 90];
const countOptions = [1, 3, 5, 10];
const terminalStatuses = new Set([
  "completed",
  "expired",
  "cancelled",
  "grading_failed",
]);
const maxRecordingMs = 90_000;
const minRecordingMs = 900;

export function ExamSimulatorPanel({ units, topics, initialUnit = 1 }: Props) {
  const initial = units.find((unit) => unit.number === initialUnit) || units[0];
  const [examMode, setExamMode] = useState("tribunal");
  const [unitId, setUnitId] = useState(initial?.id || "");
  const [unitNumbers, setUnitNumbers] = useState<number[]>(
    initial ? [initial.number] : [1],
  );
  const [topicId, setTopicId] = useState("");
  const [difficulty, setDifficulty] = useState("basic");
  const [count, setCount] = useState(3);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [session, setSession] = useState<PublicExamSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [rawTranscripts, setRawTranscripts] = useState<Record<string, string>>(
    {},
  );
  const [saving, setSaving] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [recordingQuestionId, setRecordingQuestionId] = useState("");
  const [processingQuestionId, setProcessingQuestionId] = useState("");
  const [playingKey, setPlayingKey] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const submitOnce = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingStartedAtRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  const selectedUnit =
    units.find((unit) => unit.id === unitId) || initial || units[0];
  const availableTopics = useMemo(
    () => topics.filter((topic) => topic.unitId === unitId).slice(0, 220),
    [topics, unitId],
  );
  const currentQuestion = session?.questions[currentIndex];
  const isActive = session?.status === "in_progress";
  const showResults = Boolean(session && terminalStatuses.has(session.status));
  const remaining =
    session?.deadlineAt && session.status === "in_progress"
      ? Math.max(0, Math.ceil((Date.parse(session.deadlineAt) - now) / 1000))
      : null;

  useEffect(() => {
    const cache = audioCacheRef.current;
    return () => {
      stopRecordingResources();
      stopAudio();
      for (const url of cache.values()) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    if (!session?.deadlineAt || session.status !== "in_progress") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.deadlineAt, session?.status]);

  useEffect(() => {
    if (
      !session?.id ||
      remaining === null ||
      remaining > 0 ||
      submitOnce.current
    )
      return;
    submitOnce.current = true;
    void submitExamRequest(session.id)
      .then((nextSession) => setSession(nextSession))
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : "No se pudo finalizar el simulacro.",
        ),
      );
  }, [remaining, session?.id]);

  async function startVoiceAnswer(question: PublicExamQuestion) {
    if (!session || !isActive) return;
    if (recordingQuestionId === question.id) {
      stopVoiceAnswer();
      return;
    }
    setError("");
    setVoiceNotice("");
    stopAudio();
    stopRecordingResources();
    if (!window.isSecureContext) {
      setError(
        "Chrome requiere HTTPS para usar micrófono en el celular. En producción Vercel ya usa HTTPS; recarga la página y permite el micrófono.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        "Tu navegador no permite grabación de audio. Usa Chrome actualizado o responde por texto.",
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
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void submitVoiceAnswer(question);
      };
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setRecordingQuestionId(question.id);
      setVoiceNotice(
        "Escuchando tu respuesta. Habla como lo harías ante el tribunal.",
      );
      recorder.start(250);
      window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") stopVoiceAnswer();
      }, maxRecordingMs);
    } catch {
      stopRecordingResources();
      setError(
        "No pude acceder al micrófono. Revisa el permiso del navegador o responde por texto.",
      );
    }
  }

  function stopVoiceAnswer() {
    if (mediaRecorderRef.current?.state === "recording") {
      setProcessingQuestionId(recordingQuestionId);
      setVoiceNotice("Procesando tu respuesta oral...");
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
    }
  }

  function stopRecordingResources() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setRecordingQuestionId("");
  }

  async function submitVoiceAnswer(question: PublicExamQuestion) {
    if (!session) return;
    const durationMs = recordingStartedAtRef.current
      ? Date.now() - recordingStartedAtRef.current
      : 0;
    recordingStartedAtRef.current = 0;
    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setRecordingQuestionId("");
    if (durationMs < minRecordingMs || chunks.length === 0) {
      setProcessingQuestionId("");
      setError(
        "No llegó audio suficiente. Espera que indique que está escuchando y responde al menos unos segundos.",
      );
      return;
    }
    const blob = new Blob(chunks, { type: pickMimeType() });
    if (blob.size < 900) {
      setProcessingQuestionId("");
      setError(
        "El audio recibido fue demasiado pequeño. Habla más cerca del micrófono o responde por texto.",
      );
      return;
    }
    const form = new FormData();
    form.set(
      "audio",
      blob,
      `respuesta.${blob.type.includes("webm") ? "webm" : "mp4"}`,
    );
    form.set("duration", String(Math.round(durationMs / 1000)));
    try {
      const response = await fetch(
        `/api/exams/${session.id}/voice/transcribe`,
        {
          method: "POST",
          body: form,
        },
      );
      const body = (await response.json()) as VoiceTranscription;
      if (!response.ok)
        throw new Error(body.error || "No se pudo transcribir.");
      const transcript = body.transcript.trim();
      setAnswers((state) => ({ ...state, [question.id]: transcript }));
      setRawTranscripts((state) => ({ ...state, [question.id]: transcript }));
      setVoiceNotice(
        "Transcripción lista. Revísala, corrige si hace falta y pulsa Guardar respuesta.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo transcribir tu respuesta. Puedes escribirla manualmente.",
      );
    } finally {
      setProcessingQuestionId("");
    }
  }

  async function playExamSpeech(
    key: string,
    text: string,
    style: "examiner" | "feedback",
  ) {
    if (!session) return;
    if (playingKey === key) {
      stopAudio();
      return;
    }
    setError("");
    setPlayingKey(key);
    try {
      let url = audioCacheRef.current.get(key);
      if (!url) {
        const response = await fetch(`/api/exams/${session.id}/voice/speech`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, style }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error || "No se pudo generar el audio.");
        }
        const blob = await response.blob();
        url = URL.createObjectURL(blob);
        audioCacheRef.current.set(key, url);
      }
      stopAudio(false);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlayingKey("");
      audio.onerror = () => {
        setPlayingKey("");
        setError("No se pudo reproducir el audio. Puedes leer el texto.");
      };
      await audio.play();
    } catch (err) {
      setPlayingKey("");
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo reproducir el audio. Puedes leer el texto.",
      );
    }
  }

  function stopAudio(reset = true) {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (reset) setPlayingKey("");
  }

  function selectedUnitNumbers() {
    if (examMode === "integral")
      return unitNumbers.length
        ? unitNumbers
        : units.map((unit) => unit.number).slice(0, 5);
    return [selectedUnit?.number || 1];
  }

  async function createAndStartExam() {
    if (!selectedUnit) return;
    setLoading(true);
    setError("");
    setSession(null);
    setCurrentIndex(0);
    setAnswers({});
    setRawTranscripts({});
    setVoiceNotice("");
    submitOnce.current = false;
    try {
      const topic = availableTopics.find((item) => item.id === topicId);
      const createResponse = await fetch("/api/exams/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examMode,
          unitNumbers: selectedUnitNumbers(),
          topicId: examMode === "topic" ? topicId || null : null,
          topicName: examMode === "topic" ? topic?.name || null : null,
          questionType: "open_answer",
          difficulty,
          count,
          durationMinutes,
        }),
      });
      const created = await createResponse.json();
      if (!createResponse.ok)
        throw new Error(created.error || "No se pudo crear el simulacro.");
      const startResponse = await fetch("/api/exams/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: created.examId }),
      });
      const started = await startResponse.json();
      if (!startResponse.ok)
        throw new Error(started.error || "No se pudo iniciar el simulacro.");
      setSession(started.session);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo iniciar el simulacro.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function saveAnswer(question: PublicExamQuestion) {
    if (!session) return;
    const value = (answers[question.id] ?? "").trim();
    if (value === "") {
      setError("Escribe o dicta una respuesta antes de guardar.");
      return;
    }
    const transcriptRaw = rawTranscripts[question.id]?.trim() || null;
    setSaving(question.id);
    setError("");
    try {
      const response = await fetch(`/api/exams/${session.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionQuestionId: question.id,
          answer: value,
          inputMode: transcriptRaw ? "voice" : "text",
          transcriptRaw,
          transcriptEdited: Boolean(transcriptRaw && transcriptRaw !== value),
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "No se pudo guardar la respuesta.");
      setSession(body.session);
      setVoiceNotice(
        "Respuesta guardada. El tribunal continuará con la siguiente pregunta.",
      );
      if (currentIndex < (body.session?.questions?.length || 0) - 1)
        setCurrentIndex((index) => index + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar la respuesta.",
      );
    } finally {
      setSaving("");
    }
  }

  async function submitExam(confirmBefore = true) {
    if (!session) return;
    if (
      confirmBefore &&
      !window.confirm(
        "¿Deseas finalizar el simulacro? Después de enviar verás la corrección y ya no podrás modificar respuestas.",
      )
    )
      return;
    setSubmitting(true);
    setError("");
    try {
      setSession(await submitExamRequest(session.id));
      setVoiceNotice(
        "Simulacro finalizado. Revisa la retroalimentación y escúchala si lo necesitas.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo finalizar el simulacro.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function resetExam() {
    setSession(null);
    setCurrentIndex(0);
    setAnswers({});
    setRawTranscripts({});
    setError("");
    setVoiceNotice("");
    stopRecordingResources();
    stopAudio();
    setProcessingQuestionId("");
    submitOnce.current = false;
  }

  function toggleIntegralUnit(unitNumber: number) {
    setUnitNumbers((state) =>
      state.includes(unitNumber)
        ? state.filter((item) => item !== unitNumber)
        : [...state, unitNumber].sort((a, b) => a - b),
    );
  }

  return (
    <div className="assessment-layout exam-layout">
      <section className="panel assessment-config">
        <div className="section-heading">
          <h2>Configurar simulacro</h2>
          <span>Sin retroalimentación durante el examen</span>
        </div>
        <div className="form-grid compact">
          <label>
            Modalidad
            <select
              value={examMode}
              onChange={(event) => {
                setExamMode(event.target.value);
                setTopicId("");
              }}
              disabled={isActive}
            >
              {Object.entries(modeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Unidad principal
            <select
              value={unitId}
              onChange={(event) => {
                const unit = units.find(
                  (item) => item.id === event.target.value,
                );
                setUnitId(event.target.value);
                setUnitNumbers(unit ? [unit.number] : []);
                setTopicId("");
              }}
              disabled={isActive || examMode === "integral"}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.number}. {unit.name}
                </option>
              ))}
            </select>
          </label>
          {examMode === "topic" ? (
            <label>
              Tema específico
              <select
                value={topicId}
                onChange={(event) => setTopicId(event.target.value)}
                disabled={isActive}
              >
                <option value="">Tema principal recuperado</option>
                {availableTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.number ? `${topic.number} · ` : ""}
                    {topic.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="fixed-question-type" aria-label="Tipo de pregunta">
            <span>Tipo de pregunta</span>
            <strong>Pregunta abierta de tribunal</strong>
            <small>El estudiante responde por voz o texto.</small>
          </div>
          <label>
            Nivel
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
              disabled={isActive}
            >
              {Object.entries(difficultyLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cantidad
            <select
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              disabled={isActive}
            >
              {countOptions.map((value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? "pregunta" : "preguntas"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tiempo
            <select
              value={durationMinutes}
              onChange={(event) =>
                setDurationMinutes(Number(event.target.value))
              }
              disabled={isActive}
            >
              {durationOptions.map((value) => (
                <option key={value} value={value}>
                  {value ? `${value} minutos` : "Sin límite"}
                </option>
              ))}
            </select>
          </label>
        </div>
        {examMode === "integral" ? (
          <div
            className="unit-check-grid"
            aria-label="Unidades del simulacro integral"
          >
            {units.map((unit) => (
              <label
                key={unit.id}
                className={unitNumbers.includes(unit.number) ? "selected" : ""}
              >
                <input
                  type="checkbox"
                  checked={unitNumbers.includes(unit.number)}
                  onChange={() => toggleIntegralUnit(unit.number)}
                  disabled={isActive}
                />
                U{unit.number}
              </label>
            ))}
          </div>
        ) : null}
        <button
          className="button primary"
          onClick={createAndStartExam}
          disabled={loading || isActive || !selectedUnit}
        >
          {loading ? (
            <Loader2 size={16} className="spin-icon" />
          ) : (
            <FileText size={16} />
          )}{" "}
          Iniciar nuevo simulacro
        </button>
        {session ? (
          <button
            className="button secondary"
            onClick={resetExam}
            disabled={submitting}
          >
            <RotateCcw size={15} /> Nueva configuración
          </button>
        ) : null}
        {error ? <p className="notice error">{error}</p> : null}
      </section>

      <section className="panel assessment-room exam-room-panel">
        {!session || !currentQuestion ? (
          <div className="chat-empty">
            <h3>Tribunal virtual de práctica</h3>
            <p>
              El simulacro formula preguntas abiertas, guarda tus respuestas y
              al finalizar corrige, explica y te orienta como práctica para tu
              examen oral.
            </p>
          </div>
        ) : (
          <>
            <div className="section-heading exam-status-row">
              <div>
                <h2>
                  Pregunta {currentIndex + 1} de {session.totalQuestions}
                </h2>
                <span>
                  El tribunal pregunta y espera tu respuesta ·{" "}
                  {questionTypeLabels[currentQuestion.questionType] ||
                    currentQuestion.questionType}{" "}
                  · {difficultyLabels[currentQuestion.difficulty]}
                </span>
              </div>
              <span
                className={
                  remaining !== null && remaining <= 300
                    ? "exam-timer urgent"
                    : "exam-timer"
                }
              >
                <Clock size={14} /> {formatRemaining(remaining)}
              </span>
            </div>
            <QuestionNav
              questions={session.questions}
              currentIndex={currentIndex}
              onSelect={setCurrentIndex}
            />
            <article className="assessment-question-card">
              <span>Pregunta principal</span>
              <h3>{currentQuestion.questionText}</h3>
              <div className="exam-voice-tools">
                <button
                  className="button secondary"
                  onClick={() =>
                    void playExamSpeech(
                      `question:${currentQuestion.id}`,
                      `La pregunta es: ${currentQuestion.questionText}`,
                      "examiner",
                    )
                  }
                  disabled={
                    playingKey !== "" &&
                    playingKey !== `question:${currentQuestion.id}`
                  }
                >
                  {playingKey === `question:${currentQuestion.id}` ? (
                    <PauseCircle size={16} />
                  ) : (
                    <Volume2 size={16} />
                  )}{" "}
                  Escuchar pregunta
                </button>
                {playingKey ? (
                  <button
                    className="button secondary"
                    onClick={() => stopAudio()}
                  >
                    <Square size={16} /> Detener audio
                  </button>
                ) : null}
              </div>
              {renderAnswerControl(
                currentQuestion,
                answers[currentQuestion.id] || "",
                (value) =>
                  setAnswers((state) => ({
                    ...state,
                    [currentQuestion.id]: value,
                  })),
                !isActive,
              )}
              {rawTranscripts[currentQuestion.id] &&
              rawTranscripts[currentQuestion.id] !==
                (answers[currentQuestion.id] || "") ? (
                <p className="small muted">
                  Transcripción original: {rawTranscripts[currentQuestion.id]}
                </p>
              ) : null}
              {isActive ? (
                <div className="exam-answer-actions">
                  <button
                    className="button secondary"
                    onClick={() => void startVoiceAnswer(currentQuestion)}
                    disabled={
                      saving === currentQuestion.id ||
                      submitting ||
                      processingQuestionId === currentQuestion.id
                    }
                  >
                    {processingQuestionId === currentQuestion.id ? (
                      <Loader2 size={16} className="spin-icon" />
                    ) : recordingQuestionId === currentQuestion.id ? (
                      <Square size={16} />
                    ) : (
                      <Mic size={16} />
                    )}
                    {processingQuestionId === currentQuestion.id
                      ? "Transcribiendo..."
                      : recordingQuestionId === currentQuestion.id
                        ? "Detener voz"
                        : "Responder por voz"}
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => saveAnswer(currentQuestion)}
                    disabled={saving === currentQuestion.id || submitting}
                  >
                    {saving === currentQuestion.id ? (
                      <Loader2 size={16} className="spin-icon" />
                    ) : (
                      <Save size={16} />
                    )}{" "}
                    Guardar respuesta
                  </button>
                </div>
              ) : null}
              {voiceNotice ? (
                <p className="small muted">{voiceNotice}</p>
              ) : null}
            </article>
            {showResults ? (
              <ResultsPanel
                session={session}
                playSpeech={playExamSpeech}
                playingKey={playingKey}
              />
            ) : (
              <ProgressNotice session={session} />
            )}
            <div className="assessment-actions">
              <button
                className="button secondary"
                onClick={() =>
                  setCurrentIndex((index) => Math.max(0, index - 1))
                }
                disabled={currentIndex === 0}
              >
                Anterior
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  setCurrentIndex((index) =>
                    Math.min(session.questions.length - 1, index + 1),
                  )
                }
                disabled={
                  currentIndex >= session.questions.length - 1 ||
                  (isActive && !currentQuestion.answered)
                }
              >
                Siguiente
              </button>
              {isActive ? (
                <button
                  className="button primary"
                  onClick={() => submitExam(true)}
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 size={16} className="spin-icon" />
                  ) : (
                    <Send size={16} />
                  )}{" "}
                  Finalizar examen
                </button>
              ) : null}
              {showResults ? (
                <button className="button primary" onClick={resetExam}>
                  <RotateCcw size={15} /> Iniciar nuevo simulacro
                </button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function QuestionNav({
  questions,
  currentIndex,
  onSelect,
}: {
  questions: PublicExamQuestion[];
  currentIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="exam-question-nav">
      {questions.map((question, index) => {
        const locked =
          index > currentIndex && !questions[currentIndex]?.answered;
        return (
          <button
            key={question.id}
            className={`${index === currentIndex ? "active" : ""} ${question.answered ? "answered" : ""}`}
            onClick={() => {
              if (!locked) onSelect(index);
            }}
            disabled={locked}
            aria-label={`Ir a pregunta ${index + 1}`}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
}

function ProgressNotice({ session }: { session: PublicExamSession }) {
  return (
    <p className="notice">
      <AlertTriangle size={16} /> Respuestas guardadas:{" "}
      {session.answeredQuestions}/{session.totalQuestions}. La corrección
      completa se mostrará al finalizar.
    </p>
  );
}

function ResultsPanel({
  session,
  playSpeech,
  playingKey,
}: {
  session: PublicExamSession;
  playSpeech: (
    key: string,
    text: string,
    style: "examiner" | "feedback",
  ) => Promise<void>;
  playingKey: string;
}) {
  const summaryText = [
    `Resultado orientativo: ${Math.round(session.percentage)} por ciento.`,
    session.recommendations.length
      ? `Temas para reforzar: ${session.recommendations.join("; ")}.`
      : "No hay recomendaciones pendientes registradas.",
  ].join(" ");
  return (
    <div className="exam-results-panel">
      <div className="exam-score-card">
        <strong>{Math.round(session.percentage)}%</strong>
        <span>
          {session.totalScore.toFixed(2)} de {session.maxScore.toFixed(2)}{" "}
          puntos
        </span>
        <button
          className="button secondary"
          onClick={() =>
            void playSpeech("feedback:summary", summaryText, "feedback")
          }
          disabled={playingKey !== "" && playingKey !== "feedback:summary"}
        >
          <Volume2 size={16} /> Escuchar resumen
        </button>
      </div>
      {session.recommendations.length ? (
        <div className="notice">
          <CheckCircle2 size={16} /> Reforzar:{" "}
          {session.recommendations.join("; ")}
        </div>
      ) : null}
      <div className="assessment-review-list">
        {session.questions.map((question) => (
          <FeedbackCard
            key={question.id}
            question={question}
            playSpeech={playSpeech}
            playingKey={playingKey}
          />
        ))}
      </div>
    </div>
  );
}

function FeedbackCard({
  question,
  playSpeech,
  playingKey,
}: {
  question: PublicExamQuestion;
  playSpeech: (
    key: string,
    text: string,
    style: "examiner" | "feedback",
  ) => Promise<void>;
  playingKey: string;
}) {
  const feedback = (question.feedback || {}) as Feedback;
  const positive =
    feedback.result === "correct" || feedback.result === "partially_correct";
  const spokenFeedback = buildSpokenFeedback(question, feedback);
  return (
    <article>
      <strong>
        {question.order}. {question.questionText}
      </strong>
      <p>
        <b>Tu respuesta:</b> {String(question.answer ?? "Sin respuesta")}
      </p>
      {feedback.result ? (
        <p>
          <b>Resultado:</b> {feedback.result} ·{" "}
          {Number(feedback.score || 0).toFixed(2)} punto(s)
        </p>
      ) : null}
      {feedback.correction ? (
        <p>
          <b>Corrección:</b> {feedback.correction}
        </p>
      ) : null}
      {feedback.correctAnswer ? (
        <p>
          <b>Respuesta correcta orientativa:</b> {feedback.correctAnswer}
        </p>
      ) : null}
      {feedback.explanation ? (
        <p>
          <b>Explicación:</b> {feedback.explanation}
        </p>
      ) : null}
      {feedback.whatWasGood?.length ? (
        <p>
          <b>Qué estuvo bien:</b> {feedback.whatWasGood.join("; ")}
        </p>
      ) : null}
      {feedback.missingConcepts?.length ? (
        <p>
          <b>Qué faltó:</b> {feedback.missingConcepts.join("; ")}
        </p>
      ) : null}
      {feedback.reinforce?.length ? (
        <p>
          <b>Repasar:</b> {feedback.reinforce.join("; ")}
        </p>
      ) : null}
      {feedback.sourceReferences?.length ? (
        <small>
          Fuente: {feedback.sourceReferences.slice(0, 2).join(" · ")}
        </small>
      ) : null}
      {feedback.result ? (
        <button
          className="button secondary feedback-audio-button"
          onClick={() =>
            void playSpeech(
              `feedback:${question.id}`,
              spokenFeedback,
              "feedback",
            )
          }
          disabled={
            playingKey !== "" && playingKey !== `feedback:${question.id}`
          }
        >
          <Volume2 size={15} /> Escuchar retroalimentación
        </button>
      ) : (
        <p>
          <b>Estado:</b> Pendiente de corrección o sin respuesta enviada.
        </p>
      )}
      {positive ? null : <XCircle size={15} aria-hidden="true" />}
    </article>
  );
}

function renderAnswerControl(
  question: PublicExamQuestion,
  answer: string,
  setAnswer: (value: string) => void,
  disabled: boolean,
) {
  return (
    <textarea
      className="assessment-textarea"
      value={answer}
      onChange={(event) => setAnswer(event.target.value)}
      disabled={disabled}
      placeholder="Responde como lo harías ante el tribunal. Puedes dictar tu respuesta y luego corregir la transcripción antes de guardarla."
      aria-label={`Respuesta de la pregunta ${question.order}`}
    />
  );
}

function buildSpokenFeedback(question: PublicExamQuestion, feedback: Feedback) {
  return [
    `Retroalimentación de la pregunta ${question.order}.`,
    feedback.result ? `Resultado: ${feedback.result}.` : "Resultado pendiente.",
    feedback.correction ? `Corrección: ${feedback.correction}` : "",
    feedback.correctAnswer
      ? `Respuesta orientativa: ${feedback.correctAnswer}`
      : "",
    feedback.explanation ? `Explicación: ${feedback.explanation}` : "",
    feedback.missingConcepts?.length
      ? `Debes reforzar: ${feedback.missingConcepts.join("; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function pickMimeType() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return (
    options.find((type) => MediaRecorder.isTypeSupported(type)) || "audio/webm"
  );
}

function formatRemaining(seconds: number | null) {
  if (seconds === null) return "Sin límite";
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

async function submitExamRequest(
  sessionId: string,
): Promise<PublicExamSession> {
  const response = await fetch(`/api/exams/${sessionId}/submit`, {
    method: "POST",
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "No se pudo finalizar el simulacro.");
  return body.session as PublicExamSession;
}
