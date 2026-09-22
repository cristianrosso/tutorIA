"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, FileText, Loader2, Mic, RotateCcw, Save, Send, Square, XCircle } from "lucide-react";
import type { PublicExamQuestion, PublicExamSession } from "@/lib/exams/types";

type UnitOption = { id: string; number: number; name: string };
type TopicOption = { id: string; unitId: string; number: string | null; name: string };
type Props = { units: UnitOption[]; topics: TopicOption[]; initialUnit?: number };

type SpeechRecognitionResultLike = {
  readonly isFinal?: boolean;
  readonly length: number;
  [index: number]: { readonly transcript: string } | undefined;
};

type SpeechRecognitionEventLike = {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultLike | undefined;
  };
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

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

const modeLabels: Record<string, string> = {
  unit: "Por unidad",
  topic: "Por tema",
  integral: "Integral",
  tribunal: "Tribunal escrito",
};
const questionTypeLabels: Record<string, string> = { open_answer: "Pregunta abierta de tribunal" };
const difficultyLabels: Record<string, string> = { mixed: "Mixto", basic: "Básico", intermediate: "Intermedio", advanced: "Avanzado" };
const durationOptions = [0, 15, 30, 60, 90];
const countOptions = [3, 5, 10, 15, 20, 30];
const terminalStatuses = new Set(["completed", "expired", "cancelled", "grading_failed"]);

export function ExamSimulatorPanel({ units, topics, initialUnit = 1 }: Props) {
  const initial = units.find((unit) => unit.number === initialUnit) || units[0];
  const [examMode, setExamMode] = useState("tribunal");
  const [unitId, setUnitId] = useState(initial?.id || "");
  const [unitNumbers, setUnitNumbers] = useState<number[]>(initial ? [initial.number] : [1]);
  const [topicId, setTopicId] = useState("");
  const [difficulty, setDifficulty] = useState("basic");
  const [count, setCount] = useState(3);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [session, setSession] = useState<PublicExamSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [listeningQuestionId, setListeningQuestionId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const submitOnce = useRef(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceBaseRef = useRef("");

  const selectedUnit = units.find((unit) => unit.id === unitId) || initial || units[0];
  const availableTopics = useMemo(() => topics.filter((topic) => topic.unitId === unitId).slice(0, 220), [topics, unitId]);
  const currentQuestion = session?.questions[currentIndex];
  const isActive = session?.status === "in_progress";
  const showResults = Boolean(session && terminalStatuses.has(session.status));
  const remaining = session?.deadlineAt && session.status === "in_progress" ? Math.max(0, Math.ceil((Date.parse(session.deadlineAt) - now) / 1000)) : null;

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!session?.deadlineAt || session.status !== "in_progress") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.deadlineAt, session?.status]);

  useEffect(() => {
    if (!session?.id || remaining === null || remaining > 0 || submitOnce.current) return;
    submitOnce.current = true;
    void submitExamRequest(session.id)
      .then((nextSession) => setSession(nextSession))
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo finalizar el simulacro."));
  }, [remaining, session?.id]);

  function startVoiceAnswer(question: PublicExamQuestion) {
    if (!isActive) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setError("Tu navegador no permite dictado por voz aquí. Puedes responder por texto o probar Chrome/Android con HTTPS.");
      return;
    }
    if (listeningQuestionId === question.id) {
      recognitionRef.current?.stop();
      return;
    }
    recognitionRef.current?.abort();
    voiceBaseRef.current = answers[question.id] || "";
    const recognition = new Recognition();
    recognition.lang = "es-BO";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        transcript += `${result[0]?.transcript || ""} `;
      }
      const text = `${voiceBaseRef.current} ${transcript}`.replace(/\s+/g, " ").trim();
      setAnswers((state) => ({ ...state, [question.id]: text }));
    };
    recognition.onerror = () => {
      setError("No se pudo tomar la respuesta por voz. Revisa el permiso del micrófono o responde por texto.");
    };
    recognition.onend = () => {
      setListeningQuestionId("");
      setVoiceNotice("Dictado detenido. Revisa tu respuesta y presiona Guardar respuesta.");
    };
    recognitionRef.current = recognition;
    setError("");
    setVoiceNotice("Escuchando tu respuesta. Habla como lo harías ante el tribunal.");
    setListeningQuestionId(question.id);
    recognition.start();
  }

  function selectedUnitNumbers() {
    if (examMode === "integral") return unitNumbers.length ? unitNumbers : units.map((unit) => unit.number).slice(0, 5);
    return [selectedUnit?.number || 1];
  }

  async function createAndStartExam() {
    if (!selectedUnit) return;
    setLoading(true);
    setError("");
    setSession(null);
    setCurrentIndex(0);
    setAnswers({});
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
      if (!createResponse.ok) throw new Error(created.error || "No se pudo crear el simulacro.");
      const startResponse = await fetch("/api/exams/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ examId: created.examId }),
      });
      const started = await startResponse.json();
      if (!startResponse.ok) throw new Error(started.error || "No se pudo iniciar el simulacro.");
      setSession(started.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el simulacro.");
    } finally {
      setLoading(false);
    }
  }

  async function saveAnswer(question: PublicExamQuestion) {
    if (!session) return;
    const raw = answers[question.id] ?? "";
    const value = question.questionType === "true_false" ? raw === "true" : raw.trim();
    if (value === "") {
      setError("Escribe o selecciona una respuesta antes de guardar.");
      return;
    }
    setSaving(question.id);
    setError("");
    try {
      const response = await fetch(`/api/exams/${session.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionQuestionId: question.id, answer: value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo guardar la respuesta.");
      setSession(body.session);
      if (currentIndex < (body.session?.questions?.length || 0) - 1) setCurrentIndex((index) => index + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la respuesta.");
    } finally {
      setSaving("");
    }
  }

  async function submitExam(confirmBefore = true) {
    if (!session) return;
    if (confirmBefore && !window.confirm("¿Deseas finalizar el simulacro? Después de enviar verás la corrección y ya no podrás modificar respuestas.")) return;
    setSubmitting(true);
    setError("");
    try {
      setSession(await submitExamRequest(session.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo finalizar el simulacro.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetExam() {
    setSession(null);
    setCurrentIndex(0);
    setAnswers({});
    setError("");
    setVoiceNotice("");
    recognitionRef.current?.abort();
    setListeningQuestionId("");
    submitOnce.current = false;
  }

  function toggleIntegralUnit(unitNumber: number) {
    setUnitNumbers((state) => state.includes(unitNumber) ? state.filter((item) => item !== unitNumber) : [...state, unitNumber].sort((a, b) => a - b));
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
            <select value={examMode} onChange={(event) => { setExamMode(event.target.value); setTopicId(""); }} disabled={isActive}>
              {Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Unidad principal
            <select value={unitId} onChange={(event) => { const unit = units.find((item) => item.id === event.target.value); setUnitId(event.target.value); setUnitNumbers(unit ? [unit.number] : []); setTopicId(""); }} disabled={isActive || examMode === "integral"}>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.number}. {unit.name}</option>)}
            </select>
          </label>
          {examMode === "topic" ? (
            <label>
              Tema específico
              <select value={topicId} onChange={(event) => setTopicId(event.target.value)} disabled={isActive}>
                <option value="">Tema principal recuperado</option>
                {availableTopics.map((topic) => <option key={topic.id} value={topic.id}>{topic.number ? `${topic.number} · ` : ""}{topic.name}</option>)}
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
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} disabled={isActive}>
              {Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Cantidad
            <select value={count} onChange={(event) => setCount(Number(event.target.value))} disabled={isActive}>
              {countOptions.map((value) => <option key={value} value={value}>{value} preguntas</option>)}
            </select>
          </label>
          <label>
            Tiempo
            <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} disabled={isActive}>
              {durationOptions.map((value) => <option key={value} value={value}>{value ? `${value} minutos` : "Sin límite"}</option>)}
            </select>
          </label>
        </div>
        {examMode === "integral" ? (
          <div className="unit-check-grid" aria-label="Unidades del simulacro integral">
            {units.map((unit) => (
              <label key={unit.id} className={unitNumbers.includes(unit.number) ? "selected" : ""}>
                <input type="checkbox" checked={unitNumbers.includes(unit.number)} onChange={() => toggleIntegralUnit(unit.number)} disabled={isActive} />
                U{unit.number}
              </label>
            ))}
          </div>
        ) : null}
        <button className="button primary" onClick={createAndStartExam} disabled={loading || isActive || !selectedUnit}>
          {loading ? <Loader2 size={16} className="spin-icon" /> : <FileText size={16} />} Iniciar nuevo simulacro
        </button>
        {session ? <button className="button secondary" onClick={resetExam} disabled={submitting}><RotateCcw size={15} /> Nueva configuración</button> : null}
        {error ? <p className="notice error">{error}</p> : null}
      </section>

      <section className="panel assessment-room exam-room-panel">
        {!session || !currentQuestion ? (
          <div className="chat-empty">
            <h3>Tribunal virtual de práctica</h3>
            <p>El simulacro formula preguntas abiertas, guarda tus respuestas y al finalizar corrige, explica y te orienta como práctica para tu examen oral.</p>
          </div>
        ) : (
          <>
            <div className="section-heading exam-status-row">
              <div>
                <h2>Pregunta {currentIndex + 1} de {session.totalQuestions}</h2>
                <span>El tribunal pregunta y espera tu respuesta · {questionTypeLabels[currentQuestion.questionType] || currentQuestion.questionType} · {difficultyLabels[currentQuestion.difficulty]}</span>
              </div>
              <span className={remaining !== null && remaining <= 300 ? "exam-timer urgent" : "exam-timer"}><Clock size={14} /> {formatRemaining(remaining)}</span>
            </div>
            <QuestionNav questions={session.questions} currentIndex={currentIndex} onSelect={setCurrentIndex} />
            <article className="assessment-question-card">
              <span>Pregunta principal</span>
              <h3>{currentQuestion.questionText}</h3>
              {renderAnswerControl(currentQuestion, answers[currentQuestion.id] || "", (value) => setAnswers((state) => ({ ...state, [currentQuestion.id]: value })), !isActive)}
              {isActive ? (
                <div className="exam-answer-actions">
                  <button className="button secondary" onClick={() => startVoiceAnswer(currentQuestion)} disabled={saving === currentQuestion.id || submitting}>
                    {listeningQuestionId === currentQuestion.id ? <Square size={16} /> : <Mic size={16} />} {listeningQuestionId === currentQuestion.id ? "Detener voz" : "Responder por voz"}
                  </button>
                  <button className="button secondary" onClick={() => saveAnswer(currentQuestion)} disabled={saving === currentQuestion.id || submitting}>
                    {saving === currentQuestion.id ? <Loader2 size={16} className="spin-icon" /> : <Save size={16} />} Guardar respuesta
                  </button>
                </div>
              ) : null}
              {voiceNotice ? <p className="small muted">{voiceNotice}</p> : null}
            </article>
            {showResults ? <ResultsPanel session={session} /> : <ProgressNotice session={session} />}
            <div className="assessment-actions">
              <button className="button secondary" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0}>Anterior</button>
              <button className="button secondary" onClick={() => setCurrentIndex((index) => Math.min(session.questions.length - 1, index + 1))} disabled={currentIndex >= session.questions.length - 1 || (isActive && !currentQuestion.answered)}>Siguiente</button>
              {isActive ? <button className="button primary" onClick={() => submitExam(true)} disabled={submitting}>{submitting ? <Loader2 size={16} className="spin-icon" /> : <Send size={16} />} Finalizar examen</button> : null}
              {showResults ? <button className="button primary" onClick={resetExam}><RotateCcw size={15} /> Iniciar nuevo simulacro</button> : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function QuestionNav({ questions, currentIndex, onSelect }: { questions: PublicExamQuestion[]; currentIndex: number; onSelect: (index: number) => void }) {
  return <div className="exam-question-nav">{questions.map((question, index) => {
    const locked = index > currentIndex && !questions[currentIndex]?.answered;
    return <button key={question.id} className={`${index === currentIndex ? "active" : ""} ${question.answered ? "answered" : ""}`} onClick={() => { if (!locked) onSelect(index); }} disabled={locked} aria-label={`Ir a pregunta ${index + 1}`}>{index + 1}</button>;
  })}</div>;
}

function ProgressNotice({ session }: { session: PublicExamSession }) {
  return <p className="notice"><AlertTriangle size={16} /> Respuestas guardadas: {session.answeredQuestions}/{session.totalQuestions}. La corrección completa se mostrará al finalizar.</p>;
}

function ResultsPanel({ session }: { session: PublicExamSession }) {
  return (
    <div className="exam-results-panel">
      <div className="exam-score-card">
        <strong>{Math.round(session.percentage)}%</strong>
        <span>{session.totalScore.toFixed(2)} de {session.maxScore.toFixed(2)} puntos</span>
      </div>
      {session.recommendations.length ? <div className="notice"><CheckCircle2 size={16} /> Reforzar: {session.recommendations.join("; ")}</div> : null}
      <div className="assessment-review-list">
        {session.questions.map((question) => <FeedbackCard key={question.id} question={question} />)}
      </div>
    </div>
  );
}

function FeedbackCard({ question }: { question: PublicExamQuestion }) {
  const feedback = (question.feedback || {}) as Feedback;
  const positive = feedback.result === "correct" || feedback.result === "partially_correct";
  return (
    <article>
      <strong>{question.order}. {question.questionText}</strong>
      <p><b>Tu respuesta:</b> {String(question.answer ?? "Sin respuesta")}</p>
      {feedback.result ? <p><b>Resultado:</b> {feedback.result} · {Number(feedback.score || 0).toFixed(2)} punto(s)</p> : null}
      {feedback.correction ? <p><b>Corrección:</b> {feedback.correction}</p> : null}
      {feedback.correctAnswer ? <p><b>Respuesta correcta orientativa:</b> {feedback.correctAnswer}</p> : null}
      {feedback.explanation ? <p><b>Explicación:</b> {feedback.explanation}</p> : null}
      {feedback.whatWasGood?.length ? <p><b>Qué estuvo bien:</b> {feedback.whatWasGood.join("; ")}</p> : null}
      {feedback.missingConcepts?.length ? <p><b>Qué faltó:</b> {feedback.missingConcepts.join("; ")}</p> : null}
      {feedback.reinforce?.length ? <p><b>Repasar:</b> {feedback.reinforce.join("; ")}</p> : null}
      {feedback.sourceReferences?.length ? <small>Fuente: {feedback.sourceReferences.slice(0, 2).join(" · ")}</small> : null}
      {!feedback.result ? <p><b>Estado:</b> Pendiente de corrección o sin respuesta enviada.</p> : null}
      {positive ? null : <XCircle size={15} aria-hidden="true" />}
    </article>
  );
}

function renderAnswerControl(question: PublicExamQuestion, answer: string, setAnswer: (value: string) => void, disabled: boolean) {
  if (question.questionType === "multiple_choice") {
    return <div className="assessment-options">{question.options.map((option) => <label key={option.id} className={answer === option.id ? "selected" : ""}><input type="radio" name={question.id} value={option.id} checked={answer === option.id} onChange={() => setAnswer(option.id)} disabled={disabled} /><span>{option.id}</span>{option.text}</label>)}</div>;
  }
  if (question.questionType === "true_false") {
    return <div className="assessment-options two"><label className={answer === "true" ? "selected" : ""}><input type="radio" name={question.id} checked={answer === "true"} onChange={() => setAnswer("true")} disabled={disabled} />Verdadero</label><label className={answer === "false" ? "selected" : ""}><input type="radio" name={question.id} checked={answer === "false"} onChange={() => setAnswer("false")} disabled={disabled} />Falso</label></div>;
  }
  return <textarea className="assessment-textarea" value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={disabled} placeholder="Responde como lo harías en el examen. Puedes fundamentar con conceptos, enumeraciones, ejemplos y aplicación policial." />;
}

function formatRemaining(seconds: number | null) {
  if (seconds === null) return "Sin límite";
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}


async function submitExamRequest(sessionId: string): Promise<PublicExamSession> {
  const response = await fetch(`/api/exams/${sessionId}/submit`, { method: "POST" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "No se pudo finalizar el simulacro.");
  return body.session as PublicExamSession;
}
