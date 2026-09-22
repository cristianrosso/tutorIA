"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, RotateCcw, Send, XCircle } from "lucide-react";
import type { AssessmentSessionPublic, PublicAssessmentQuestion } from "@/lib/assessment/types";

type UnitOption = { id: string; number: number; name: string };
type TopicOption = { id: string; unitId: string; number: string | null; name: string };

type Props = { units: UnitOption[]; topics: TopicOption[]; initialUnit?: number };

const questionTypeLabels: Record<string, string> = {
  mixed: "Mixta",
  multiple_choice: "Opción múltiple",
  true_false: "Verdadero/Falso",
  short_answer: "Respuesta corta",
  open_answer: "Pregunta abierta",
  case_application: "Caso de aplicación",
};
const difficultyLabels: Record<string, string> = { basic: "Básico", intermediate: "Intermedio", advanced: "Avanzado" };
const resultLabels: Record<string, string> = { correct: "Correcta", partially_correct: "Parcialmente correcta", incorrect: "Incorrecta", requires_review: "Requiere revisión" };

export function AssessmentPracticePanel({ units, topics, initialUnit = 1 }: Props) {
  const initial = units.find((unit) => unit.number === initialUnit) || units[0];
  const [unitId, setUnitId] = useState(initial?.id || "");
  const [topicId, setTopicId] = useState("");
  const [questionType, setQuestionType] = useState("mixed");
  const [difficulty, setDifficulty] = useState("basic");
  const [count, setCount] = useState(5);
  const [session, setSession] = useState<AssessmentSessionPublic | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedUnit = units.find((unit) => unit.id === unitId) || units[0];
  const availableTopics = useMemo(() => topics.filter((topic) => topic.unitId === unitId).slice(0, 180), [topics, unitId]);
  const currentQuestion = session?.questions[currentIndex];

  async function startAssessment() {
    if (!selectedUnit) return;
    setLoading(true);
    setError("");
    setSession(null);
    setCurrentIndex(0);
    setAnswer("");
    try {
      const topic = availableTopics.find((item) => item.id === topicId);
      const response = await fetch("/api/assessment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitNumber: selectedUnit.number, topicId: topicId || null, topicName: topic?.name || null, questionType, difficulty, count }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo iniciar la evaluación.");
      setSession(body.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar la evaluación.");
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer(question: PublicAssessmentQuestion) {
    if (!session) return;
    const value = question.questionType === "true_false" ? answer === "true" : answer.trim();
    if (value === "") {
      setError("Responde antes de enviar.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/assessment/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, questionId: question.id, answer: value }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo corregir la respuesta.");
      setSession(body.session);
      setAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo corregir la respuesta.");
    } finally {
      setLoading(false);
    }
  }

  function nextQuestion() {
    if (!session) return;
    setCurrentIndex((index) => Math.min(session.questions.length - 1, index + 1));
    setAnswer("");
  }

  function currentFeedback() {
    return session?.questions[currentIndex]?.feedback;
  }

  return (
    <div className="assessment-layout">
      <section className="panel assessment-config">
        <div className="section-heading">
          <h2>Configurar práctica</h2>
          <span>Basada en el compendio</span>
        </div>
        <div className="form-grid compact">
          <label>
            Unidad
            <select value={unitId} onChange={(event) => { setUnitId(event.target.value); setTopicId(""); }}>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.number}. {unit.name}</option>)}
            </select>
          </label>
          <label>
            Tema
            <select value={topicId} onChange={(event) => setTopicId(event.target.value)}>
              <option value="">Tema principal de la unidad</option>
              {availableTopics.map((topic) => <option key={topic.id} value={topic.id}>{topic.number ? `${topic.number} · ` : ""}{topic.name}</option>)}
            </select>
          </label>
          <label>
            Tipo
            <select value={questionType} onChange={(event) => setQuestionType(event.target.value)}>
              {Object.entries(questionTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Nivel
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              {Object.entries(difficultyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            Cantidad
            <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
              {[5, 10, 15, 20].map((value) => <option key={value} value={value}>{value} preguntas</option>)}
            </select>
          </label>
        </div>
        <button className="button primary" onClick={startAssessment} disabled={loading || !selectedUnit}>
          {loading && !session ? <Loader2 size={16} className="spin-icon" /> : <ArrowRight size={16} />} Comenzar evaluación
        </button>
        {error ? <p className="notice error">{error}</p> : null}
      </section>

      <section className="panel assessment-room">
        {!session || !currentQuestion ? (
          <div className="chat-empty">
            <h3>Práctica formativa</h3>
            <p>Selecciona unidad, tema y tipo de pregunta. Las respuestas correctas se guardan en el servidor y se muestran recién después de responder.</p>
          </div>
        ) : (
          <>
            <div className="section-heading">
              <div>
                <h2>Pregunta {currentIndex + 1} de {session.totalQuestions}</h2>
                <span>{questionTypeLabels[currentQuestion.questionType] || currentQuestion.questionType} · {difficultyLabels[currentQuestion.difficulty]}</span>
              </div>
              <span>{session.answeredQuestions}/{session.totalQuestions} respondidas</span>
            </div>
            <article className="assessment-question-card">
              <span>{session.unitName}{session.topicName ? ` · ${session.topicName}` : ""}</span>
              <h3>{currentQuestion.questionText}</h3>
              {renderAnswerControl(currentQuestion, answer, setAnswer)}
              {!currentQuestion.answered ? (
                <button className="button primary" onClick={() => submitAnswer(currentQuestion)} disabled={loading}>
                  {loading ? <Loader2 size={16} className="spin-icon" /> : <Send size={16} />} Responder
                </button>
              ) : null}
            </article>
            {currentFeedback() ? <FeedbackCard feedback={currentFeedback()!} /> : null}
            <div className="assessment-actions">
              <button className="button secondary" onClick={nextQuestion} disabled={currentIndex >= session.questions.length - 1}>Siguiente pregunta</button>
              <button className="button secondary" onClick={startAssessment} disabled={loading}><RotateCcw size={15} /> Practicar nuevamente</button>
              {session.status === "completed" ? <Link className="button primary" href={`/evaluaciones?session=${session.id}`}>Ver resultado</Link> : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function renderAnswerControl(question: PublicAssessmentQuestion, answer: string, setAnswer: (value: string) => void) {
  if (question.questionType === "multiple_choice") {
    return <div className="assessment-options">{question.options.map((option) => <label key={option.id} className={answer === option.id ? "selected" : ""}><input type="radio" name={question.id} value={option.id} checked={answer === option.id} onChange={() => setAnswer(option.id)} disabled={question.answered} /><span>{option.id}</span>{option.text}</label>)}</div>;
  }
  if (question.questionType === "true_false") {
    return <div className="assessment-options two"><label className={answer === "true" ? "selected" : ""}><input type="radio" name={question.id} checked={answer === "true"} onChange={() => setAnswer("true")} disabled={question.answered} />Verdadero</label><label className={answer === "false" ? "selected" : ""}><input type="radio" name={question.id} checked={answer === "false"} onChange={() => setAnswer("false")} disabled={question.answered} />Falso</label></div>;
  }
  return <textarea className="assessment-textarea" value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={question.answered} placeholder="Responde con tus palabras. El sistema aceptará formulaciones equivalentes cuando estén bien fundamentadas." />;
}

function FeedbackCard({ feedback }: { feedback: NonNullable<PublicAssessmentQuestion["feedback"]> }) {
  const positive = feedback.result === "correct" || feedback.result === "partially_correct";
  return (
    <article className={`assessment-feedback ${positive ? "positive" : "negative"}`}>
      <h3>{positive ? <CheckCircle2 size={18} /> : <XCircle size={18} />} {resultLabels[feedback.result]}</h3>
      <p><b>Corrección:</b> {feedback.correction}</p>
      {feedback.correctAnswer ? <p><b>Respuesta correcta orientativa:</b> {feedback.correctAnswer}</p> : null}
      <p><b>Explicación:</b> {feedback.explanation}</p>
      {feedback.whatWasGood.length ? <p><b>Qué estuvo bien:</b> {feedback.whatWasGood.join("; ")}</p> : null}
      {feedback.missingConcepts.length ? <p><b>Qué faltó:</b> {feedback.missingConcepts.join("; ")}</p> : null}
      {feedback.reinforce.length ? <p><b>Repasar:</b> {feedback.reinforce.join("; ")}</p> : null}
      {feedback.sourceReferences.length ? <small>Fuente: {feedback.sourceReferences.slice(0, 2).join(" · ")}</small> : null}
    </article>
  );
}
