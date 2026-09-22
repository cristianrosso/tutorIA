import Link from "next/link";
import { FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireStudent } from "@/lib/auth/session";
import { getExamHistory } from "@/lib/exams/exam-service";

export default async function ExamHistoryPage() {
  const profile = await requireStudent();
  const history = await getExamHistory(profile);
  return (
    <AppShell profile={profile} active="simulacro">
      <div className="page-heading">
        <div>
          <span className="eyebrow">HISTORIAL DE SIMULACROS</span>
          <h1>Exámenes<span className="heading-dot">.</span></h1>
          <p>Consulta tus simulacros escritos y vuelve a revisar la retroalimentación cuando el examen esté finalizado.</p>
        </div>
        <Link className="button primary" href="/simulacro"><FileText size={15} /> Nuevo simulacro</Link>
      </div>
      <section className="panel assessment-review-list">
        {history.length ? history.map((exam) => (
          <article key={exam.id}>
            <strong>{exam.examMode} · {exam.status}</strong>
            <p>{exam.totalQuestions} preguntas · {Number(exam.totalScore || 0).toFixed(2)} / {Number(exam.maxScore || 0).toFixed(2)} puntos</p>
            <p>Creado: {exam.createdAt ? new Date(exam.createdAt).toLocaleString("es-BO") : "sin fecha"}</p>
            <Link className="button secondary" href={`/examenes/${exam.id}/resultados`}>Ver resultado</Link>
          </article>
        )) : <div className="chat-empty"><h3>Sin simulacros registrados</h3><p>Inicia tu primer simulacro desde la pantalla principal.</p></div>}
      </section>
    </AppShell>
  );
}
