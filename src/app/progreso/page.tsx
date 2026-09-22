import Link from "next/link";
import { ArrowRight, BookOpenCheck, Target } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireProfile } from "@/lib/auth/session";
import { getStudentStats } from "@/lib/data";
import {
  getResumeStudySuggestion,
  getStudentLearningSummary,
} from "@/lib/learning/academic-memory";
import { generateLearningRecommendations } from "@/lib/adaptive/recommendation-engine";

export default async function ProgressPage() {
  const profile = await requireProfile();
  const [stats, learning, resume, adaptiveRecommendations] = await Promise.all([
    getStudentStats(),
    getStudentLearningSummary(profile.id),
    getResumeStudySuggestion(profile.id),
    generateLearningRecommendations({ userId: profile.id, limit: 3 }),
  ]);
  const currentUnit = Array.isArray(learning.profile?.academic_units)
    ? learning.profile?.academic_units[0]
    : learning.profile?.academic_units;
  const currentTopic = Array.isArray(learning.profile?.academic_topics)
    ? learning.profile?.academic_topics[0]
    : learning.profile?.academic_topics;
  const studiedTopics = learning.units.reduce(
    (sum, unit) => sum + unit.studiedTopics,
    0,
  );
  const totalTopics = learning.units.reduce(
    (sum, unit) => sum + unit.totalTopics,
    0,
  );
  const academicCoverage = totalTopics
    ? Math.round((studiedTopics / totalTopics) * 100)
    : 0;
  return (
    <AppShell profile={profile} active="progress">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PROGRESO ACADÉMICO</span>
          <h1>
            Mi progreso<span className="heading-dot">.</span>
          </h1>
          <p>
            Seguimiento formativo basado en preguntas, prácticas y simulacros.
          </p>
        </div>
      </div>
      <div className="progress-summary">
        <div className="panel">
          <span>Cobertura académica</span>
          <strong>{academicCoverage}%</strong>
          <small>
            {studiedTopics} de {totalTopics} temas trabajados
          </small>
        </div>
        <div className="panel">
          <span>Rendimiento observado</span>
          <strong>
            {learning.evaluated.observedAccuracy === null
              ? "Sin evidencia"
              : `${learning.evaluated.observedAccuracy}%`}
          </strong>
          <small>
            {learning.evaluated.attempts
              ? `${learning.evaluated.correct} correctas · ${learning.evaluated.incorrect} incorrectas`
              : "Todavía no existen suficientes actividades evaluativas"}
          </small>
        </div>
        <div className="panel">
          <span>Última actividad</span>
          <strong>
            {learning.profile?.last_studied_at
              ? new Date(learning.profile.last_studied_at).toLocaleDateString(
                  "es-BO",
                  { timeZone: "America/La_Paz" },
                )
              : "Sin registro"}
          </strong>
          <small>{stats.conversations + stats.practices} interacciones</small>
        </div>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Memoria de aprendizaje</h2>
          <span>Basada en actividades registradas</span>
        </div>
        <div className="learning-memory-card">
          <BookOpenCheck size={24} />
          <div>
            <strong>
              {currentTopic?.topic_name ||
                currentUnit?.unit_name ||
                "Aún no hay un tema actual"}
            </strong>
            <p>{resume.description}</p>
          </div>
          <Link className="button primary" href={resume.href}>
            {resume.label} <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Plan recomendado</h2>
          <span>Motor adaptativo Sprint 9</span>
        </div>
        {adaptiveRecommendations.length ? (
          <div className="learning-memory-card">
            <Target size={24} />
            <div>
              <strong>
                {adaptiveRecommendations[0].title ||
                  adaptiveRecommendations[0].topicName ||
                  "Siguiente paso sugerido"}
              </strong>
              <p>{adaptiveRecommendations[0].reason}</p>
            </div>
            <Link className="button primary" href="/recomendaciones">
              Ver recomendaciones <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <p className="notice">
            Realiza prácticas o simulacros para activar recomendaciones
            adaptativas.
          </p>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <h2>Temas que debes reforzar</h2>
          <span>Máximo 3 recomendaciones</span>
        </div>
        {learning.review.length ? (
          <ul className="recommendation-list">
            {learning.review.map((row) => {
              const topic = Array.isArray(row.academic_topics)
                ? row.academic_topics[0]
                : row.academic_topics;
              return (
                <li key={row.knowledge_object_id}>
                  <Target size={15} />{" "}
                  {topic?.topic_name || row.knowledge_object_id}
                </li>
              );
            })}
          </ul>
        ) : stats.weakTopics.length ? (
          <ul className="recommendation-list">
            {stats.weakTopics.map((topic) => (
              <li key={topic}>
                <Target size={15} /> {topic}
              </li>
            ))}
          </ul>
        ) : (
          <p className="notice">
            Realiza tu primer simulacro para obtener recomendaciones
            personalizadas.
          </p>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Progreso por unidad</h2>
          <span>{learning.units.length} unidades</span>
        </div>
        <div className="progress-unit-list">
          {learning.units.map((unit) => (
            <Link href={`/unidad/${unit.unitNumber}`} key={unit.unitId}>
              <strong>
                {String(unit.unitNumber).padStart(2, "0")} · {unit.unitName}
              </strong>
              <span>
                {unit.studiedTopics} de {unit.totalTopics} temas · Cobertura{" "}
                {unit.coveragePercent}%
              </span>
              <div className="progress-bar">
                <span style={{ width: `${unit.coveragePercent}%` }} />
              </div>
              <small>
                Última actividad:{" "}
                {unit.lastStudiedAt
                  ? new Date(unit.lastStudiedAt).toLocaleDateString("es-BO", {
                      timeZone: "America/La_Paz",
                    })
                  : "Sin registro"}
              </small>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
