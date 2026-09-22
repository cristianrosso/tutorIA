import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireStudent } from "@/lib/auth/session";
import { getAssessmentHistory, getAssessmentSession } from "@/lib/assessment/session-service";

export default async function AssessmentHistoryPage({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const profile = await requireStudent();
  const params = await searchParams;
  const [history, selected] = await Promise.all([
    getAssessmentHistory(profile),
    params.session ? getAssessmentSession(profile, params.session).catch(() => null) : Promise.resolve(null),
  ]);
  return (
    <AppShell profile={profile} active="practice">
      <div className="page-heading">
        <div>
          <span className="eyebrow">HISTORIAL FORMATIVO</span>
          <h1>Mis evaluaciones<span className="heading-dot">.</span></h1>
          <p>Revisa preguntas, respuestas, retroalimentación y fuentes usadas.</p>
        </div>
        <Link className="button primary" href="/practica">Nueva práctica</Link>
      </div>
      <div className="assessment-history-layout">
        <section className="panel history-list">
          <div className="section-heading"><h2>Sesiones recientes</h2><span>{history.length} registros</span></div>
          {history.length ? history.map((item) => (
            <Link className="history-card" key={item.id} href={`/evaluaciones?session=${item.id}`}>
              <ClipboardList size={20} />
              <div>
                <strong>{item.unitName}{item.topicName ? ` · ${item.topicName}` : ""}</strong>
                <span>{new Date(item.startedAt).toLocaleString("es-BO", { timeZone: "America/La_Paz" })} · {item.status}</span>
                <p>{item.answeredQuestions}/{item.totalQuestions} respondidas · Puntaje {item.totalScore}/{item.maxScore}</p>
              </div>
            </Link>
          )) : <p className="notice">Todavía no tienes evaluaciones registradas.</p>}
        </section>
        <section className="panel">
          <div className="section-heading"><h2>Detalle</h2><span>Retroalimentación</span></div>
          {selected ? (
            <div className="assessment-review-list">
              <p className="notice success">Resultado: {selected.totalScore}/{selected.maxScore} · Correctas {selected.correctAnswers} · Parciales {selected.partialAnswers} · Incorrectas {selected.incorrectAnswers}</p>
              {selected.questions.map((question) => (
                <article key={question.id}>
                  <strong>{question.order}. {question.questionText}</strong>
                  {question.feedback ? <p><b>{question.feedback.result}:</b> {question.feedback.correction}</p> : <p>Sin respuesta registrada.</p>}
                </article>
              ))}
            </div>
          ) : <p className="notice">Selecciona una evaluación del historial para revisar el detalle.</p>}
        </section>
      </div>
    </AppShell>
  );
}
