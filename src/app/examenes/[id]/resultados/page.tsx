import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireStudent } from "@/lib/auth/session";
import { getExamSession } from "@/lib/exams/exam-service";

export default async function ExamResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireStudent();
  const { id } = await params;
  const session = await getExamSession(profile, id, { includeFeedback: true });
  return (
    <AppShell profile={profile} active="simulacro">
      <div className="page-heading">
        <div>
          <span className="eyebrow">RESULTADO DEL SIMULACRO</span>
          <h1>Resultado<span className="heading-dot">.</span></h1>
          <p>{session.totalQuestions} preguntas · {Math.round(session.percentage)}% de rendimiento.</p>
        </div>
        <Link className="button primary" href="/simulacro"><RotateCcw size={15} /> Nuevo simulacro</Link>
      </div>
      <section className="panel assessment-review-list">
        <article>
          <strong>Puntaje final</strong>
          <p>{session.totalScore.toFixed(2)} de {session.maxScore.toFixed(2)} puntos · estado: {session.status}</p>
          {session.recommendations.length ? <p><b>Reforzar:</b> {session.recommendations.join("; ")}</p> : null}
        </article>
        {session.questions.map((question) => {
          const feedback = (question.feedback || {}) as { correction?: string; correctAnswer?: string; explanation?: string; result?: string; sourceReferences?: string[] };
          return (
            <article key={question.id}>
              <strong>{question.order}. {question.questionText}</strong>
              <p><b>Tu respuesta:</b> {String(question.answer ?? "Sin respuesta")}</p>
              {feedback.result ? <p><b>Resultado:</b> {feedback.result}</p> : null}
              {feedback.correction ? <p><b>Corrección:</b> {feedback.correction}</p> : null}
              {feedback.correctAnswer ? <p><b>Respuesta correcta:</b> {feedback.correctAnswer}</p> : null}
              {feedback.explanation ? <p><b>Explicación:</b> {feedback.explanation}</p> : null}
              {feedback.sourceReferences?.length ? <small>Fuente: {feedback.sourceReferences.slice(0, 2).join(" · ")}</small> : null}
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}
