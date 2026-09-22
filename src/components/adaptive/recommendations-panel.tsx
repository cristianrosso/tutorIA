"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, RotateCcw, X } from "lucide-react";
import type { AdaptiveRecommendation } from "@/lib/adaptive/types";

export function RecommendationsPanel({
  initialRecommendations,
}: {
  initialRecommendations: AdaptiveRecommendation[];
}) {
  const [items, setItems] = useState(initialRecommendations);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function updateStatus(
    item: AdaptiveRecommendation,
    action: "accept" | "postpone" | "dismiss" | "complete",
  ) {
    if (!item.id) return;
    setPendingId(item.id);
    startTransition(async () => {
      await fetch(`/api/adaptive/recommendations/${item.id}/${action}`, {
        method: "POST",
      });
      if (action === "dismiss" || action === "complete") {
        setItems((current) =>
          current.filter((candidate) => candidate.id !== item.id),
        );
      } else {
        setItems((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? {
                  ...candidate,
                  status: action === "accept" ? "accepted" : "postponed",
                }
              : candidate,
          ),
        );
      }
      setPendingId(null);
    });
  }

  if (!items.length) {
    return (
      <p className="notice">
        Aún no existen suficientes evidencias para generar recomendaciones
        adaptativas.
      </p>
    );
  }

  return (
    <div className="recommendation-cards">
      {items.map((item) => {
        const targetHref = targetLink(item);
        const disabled = isPending && pendingId === item.id;
        return (
          <article
            className="recommendation-card"
            key={
              item.id ||
              `${item.recommendationType}-${item.knowledgeObjectId || item.topicId || item.unitId}`
            }
          >
            <div>
              <span className="eyebrow">
                {typeLabel(item.recommendationType)} · Prioridad {item.priority}
              </span>
              <h3>
                {item.title ||
                  item.topicName ||
                  item.unitName ||
                  "Tema recomendado"}
              </h3>
              <p>{item.reason}</p>
              <small>
                {item.unitNumber
                  ? `Unidad ${item.unitNumber}`
                  : "Unidad por definir"}
                {item.topicName ? ` · ${item.topicName}` : ""} · Dificultad
                sugerida: {difficultyLabel(item.recommendedDifficulty)}
              </small>
            </div>
            <div className="recommendation-actions">
              <Link className="button primary" href={targetHref}>
                Estudiar ahora <ArrowRight size={15} />
              </Link>
              <button
                className="button ghost"
                disabled={disabled}
                onClick={() => updateStatus(item, "accept")}
              >
                <CheckCircle2 size={15} /> Aceptar
              </button>
              <button
                className="button ghost"
                disabled={disabled}
                onClick={() => updateStatus(item, "postpone")}
              >
                <Clock3 size={15} /> Posponer
              </button>
              <button
                className="button ghost"
                disabled={disabled}
                onClick={() => updateStatus(item, "complete")}
              >
                <RotateCcw size={15} /> Completar
              </button>
              <button
                className="button ghost"
                disabled={disabled}
                onClick={() => updateStatus(item, "dismiss")}
              >
                <X size={15} /> Descartar
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function targetLink(item: AdaptiveRecommendation) {
  const unit = item.unitNumber || 1;
  if (
    item.recommendationType === "PRACTICE_TOPIC" ||
    item.recommendationType === "RETRY_ASSESSMENT"
  )
    return `/practica?unit=${unit}`;
  if (
    item.recommendationType === "START_NEW_TOPIC" ||
    item.recommendationType === "CONTINUE_TOPIC"
  )
    return `/tutor?unit=${unit}`;
  return `/tutor?unit=${unit}`;
}

function typeLabel(type: AdaptiveRecommendation["recommendationType"]) {
  if (type === "REVIEW_TOPIC") return "Repaso";
  if (type === "PRACTICE_TOPIC") return "Práctica";
  if (type === "REVIEW_PREREQUISITE") return "Prerequisito";
  if (type === "CONTINUE_TOPIC") return "Continuar";
  if (type === "RETRY_ASSESSMENT") return "Reintentar";
  return "Comenzar";
}

function difficultyLabel(value: string | null | undefined) {
  if (value === "advanced") return "avanzada";
  if (value === "intermediate") return "intermedia";
  return "básica";
}
