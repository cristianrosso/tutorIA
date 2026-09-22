"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Play, RefreshCcw } from "lucide-react";

type UnitOption = { id: string; unit_number: number; unit_name: string };
type StudyPlanDetail = {
  plan: Record<string, unknown>;
  activities: Array<Record<string, unknown>>;
  summary: {
    scheduledActivities: number;
    completedActivities: number;
    pendingActivities: number;
    completedMinutes: number;
    plannedMinutes: number;
    todayMinutes: number;
    todayActivities: Array<Record<string, unknown>>;
  };
};

const dayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export function StudyPlanManager({
  units,
  initialPlan,
}: {
  units: UnitOption[];
  initialPlan: StudyPlanDetail | null;
}) {
  const [plan, setPlan] = useState(initialPlan);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedUnits, setSelectedUnits] = useState<string[]>(
    units.slice(0, 2).map((unit) => unit.id),
  );
  const today = new Date();
  const defaultExamDate = new Date(today.getTime() + 45 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const grouped = useMemo(() => {
    const map = new Map<string, Array<Record<string, unknown>>>();
    for (const activity of plan?.activities || []) {
      const date = String(activity.scheduled_date || "Sin fecha");
      map.set(date, [...(map.get(date) || []), activity]);
    }
    return [...map.entries()].slice(0, 21);
  }, [plan]);

  async function createPlan(formData: FormData) {
    setError(null);
    const availability = dayLabels.map((_, dayOfWeek) => ({
      dayOfWeek,
      availableMinutes: Number(formData.get(`minutes-${dayOfWeek}`) || 0),
      preferredStartTime: String(formData.get(`time-${dayOfWeek}`) || "19:00"),
    }));
    const payload = {
      title: String(formData.get("title") || "Plan de estudio FATESCIPOL"),
      startDate: String(formData.get("startDate")),
      examDate: String(formData.get("examDate")),
      timezone: "America/La_Paz",
      selectedUnitIds: selectedUnits,
      selectedUnitNumbers: [],
      selectedTopicIds: [],
      availability,
      preferences: {
        reviewIntensity: String(formData.get("reviewIntensity") || "normal"),
        includeSimulations: formData.get("includeSimulations") === "on",
        simulationsPerWeek: Number(formData.get("simulationsPerWeek") || 1),
        includeFormativeAssessments: true,
        maxActivitiesPerDay: Number(formData.get("maxActivitiesPerDay") || 4),
      },
    };
    startTransition(async () => {
      const response = await fetch("/api/study-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error || "No se pudo crear el plan.");
      else setPlan(data);
    });
  }

  async function patchPlan(status: string) {
    if (!plan?.plan?.id) return;
    startTransition(async () => {
      const response = await fetch(`/api/study-plans/${plan.plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok)
        setError(data.error || "No se pudo actualizar el plan.");
      else setPlan(data);
    });
  }

  async function completeActivity(activityId: unknown) {
    if (!plan?.plan?.id || !activityId) return;
    startTransition(async () => {
      const response = await fetch(
        `/api/study-plans/${plan.plan.id}/activities/${activityId}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const data = await response.json();
      if (!response.ok)
        setError(data.error || "No se pudo completar la actividad.");
      else setPlan(data);
    });
  }

  async function reschedule() {
    if (!plan?.plan?.id) return;
    startTransition(async () => {
      const response = await fetch(
        `/api/study-plans/${plan.plan.id}/confirm-adjustment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: "Reprogramación solicitada por el estudiante",
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) setError(data.error || "No se pudo reprogramar.");
      else setPlan(data);
    });
  }

  return (
    <div className="study-plan-grid">
      <section className="panel">
        <div className="section-heading">
          <h2>Configurar plan</h2>
          <span>Fechas, unidades y disponibilidad</span>
        </div>
        <form action={createPlan} className="study-plan-form">
          <label>
            Título
            <input name="title" defaultValue="Plan de estudio FATESCIPOL" />
          </label>
          <label>
            Inicio
            <input
              name="startDate"
              type="date"
              defaultValue={today.toISOString().slice(0, 10)}
              required
            />
          </label>
          <label>
            Fecha del examen
            <input
              name="examDate"
              type="date"
              defaultValue={defaultExamDate}
              required
            />
          </label>
          <label>
            Repaso
            <select name="reviewIntensity" defaultValue="normal">
              <option value="low">Ligero</option>
              <option value="normal">Normal</option>
              <option value="high">Intenso</option>
            </select>
          </label>
          <label>
            Actividades por día
            <select name="maxActivitiesPerDay" defaultValue="4">
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </label>
          <label>
            Simulacros por semana
            <select name="simulationsPerWeek" defaultValue="1">
              <option value="0">0</option>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input name="includeSimulations" type="checkbox" defaultChecked />{" "}
            Incluir simulacros
          </label>
          <div className="unit-selector">
            {units.map((unit) => (
              <button
                type="button"
                className={
                  selectedUnits.includes(unit.id) ? "chip selected" : "chip"
                }
                key={unit.id}
                onClick={() =>
                  setSelectedUnits((current) =>
                    current.includes(unit.id)
                      ? current.filter((id) => id !== unit.id)
                      : [...current, unit.id],
                  )
                }
              >
                {unit.unit_number}. {unit.unit_name}
              </button>
            ))}
          </div>
          <div className="availability-grid">
            {dayLabels.map((label, index) => (
              <div key={label} className="availability-day">
                <strong>{label}</strong>
                <input
                  name={`minutes-${index}`}
                  type="number"
                  min="0"
                  max="720"
                  step="15"
                  defaultValue={index === 0 ? 0 : index === 6 ? 180 : 120}
                />
                <input
                  name={`time-${index}`}
                  type="time"
                  defaultValue={index === 6 ? "09:00" : "19:00"}
                />
              </div>
            ))}
          </div>
          {error && <p className="error-box">{error}</p>}
          <button
            className="button primary"
            disabled={isPending || !selectedUnits.length}
          >
            {isPending ? "Generando..." : "Generar propuesta"}
          </button>
        </form>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Mi estudio de hoy</h2>
          <span>
            {plan ? `${plan.summary.todayMinutes} minutos` : "Sin plan activo"}
          </span>
        </div>
        {plan ? (
          <>
            <div className="progress-summary compact">
              <div>
                <span>Programadas</span>
                <strong>{plan.summary.scheduledActivities}</strong>
              </div>
              <div>
                <span>Completadas</span>
                <strong>{plan.summary.completedActivities}</strong>
              </div>
              <div>
                <span>Pendientes</span>
                <strong>{plan.summary.pendingActivities}</strong>
              </div>
            </div>
            <div className="study-plan-actions">
              {plan.plan.status === "draft" && (
                <button
                  className="button primary"
                  onClick={() => patchPlan("active")}
                >
                  <Play size={15} /> Activar plan
                </button>
              )}
              {plan.plan.status === "active" && (
                <button
                  className="button ghost"
                  onClick={() => patchPlan("paused")}
                >
                  Pausar
                </button>
              )}
              {plan.plan.status === "paused" && (
                <button
                  className="button primary"
                  onClick={() => patchPlan("active")}
                >
                  Reanudar
                </button>
              )}
              <button className="button ghost" onClick={reschedule}>
                <RefreshCcw size={15} /> Reprogramar pendientes
              </button>
            </div>
            {(plan.summary.todayActivities || []).length ? (
              plan.summary.todayActivities.map((activity) => (
                <ActivityCard
                  key={String(activity.id)}
                  activity={activity}
                  onComplete={completeActivity}
                />
              ))
            ) : (
              <p className="notice">
                No tienes actividades programadas para hoy.
              </p>
            )}
          </>
        ) : (
          <p className="notice">
            Configura tu primer plan para ver tu estudio diario.
          </p>
        )}
      </section>
      <section className="panel study-plan-calendar">
        <div className="section-heading">
          <h2>
            <CalendarDays size={21} /> Cronograma
          </h2>
          <span>Vista por día</span>
        </div>
        {grouped.length ? (
          grouped.map(([date, activities]) => (
            <div className="calendar-day-block" key={date}>
              <h3>
                {new Date(`${date}T00:00:00`).toLocaleDateString("es-BO", {
                  weekday: "long",
                  day: "2-digit",
                  month: "short",
                })}
              </h3>
              {activities.map((activity) => (
                <ActivityCard
                  key={String(activity.id)}
                  activity={activity}
                  onComplete={completeActivity}
                />
              ))}
            </div>
          ))
        ) : (
          <p className="notice">
            El cronograma aparecerá después de generar la propuesta.
          </p>
        )}
      </section>
    </div>
  );
}

function ActivityCard({
  activity,
  onComplete,
}: {
  activity: Record<string, unknown>;
  onComplete: (id: unknown) => void;
}) {
  const actionPath =
    typeof activity.action_path === "string" ? activity.action_path : null;
  return (
    <article className="activity-card">
      <div>
        <strong>{String(activity.title)}</strong>
        <small>
          {String(activity.activity_type)} ·{" "}
          {String(activity.estimated_minutes)} min · {String(activity.status)}
        </small>
      </div>
      <div className="activity-actions">
        {actionPath && (
          <Link className="button ghost" href={actionPath}>
            Iniciar
          </Link>
        )}
        {activity.status !== "completed" && (
          <button
            className="button ghost"
            onClick={() => onComplete(activity.id)}
          >
            <CheckCircle2 size={15} /> Completar
          </button>
        )}
      </div>
    </article>
  );
}
