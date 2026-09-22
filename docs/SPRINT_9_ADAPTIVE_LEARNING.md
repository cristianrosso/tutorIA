# Sprint 9 — Motor adaptativo de aprendizaje inteligente

Este sprint agrega una capa adaptativa entre la memoria de aprendizaje, las evaluaciones y el tutor. No reemplaza el RAG, no cambia la voz y no usa OpenAI para calcular dominio ni recomendaciones.

## Arquitectura

- `student_learning_evidence`, `assessment_answers` y `exam_session_answers` alimentan el motor de evidencia.
- `src/lib/adaptive/mastery-estimator.ts` calcula dominio por tema/objeto de conocimiento con reglas determinísticas.
- `src/lib/adaptive/learning-gaps.ts` clasifica brechas: evidencia insuficiente, error aislado, dificultad observada o dificultad recurrente.
- `src/lib/adaptive/recommendation-engine.ts` genera recomendaciones accionables y registra eventos adaptativos.
- `/recomendaciones` muestra el plan adaptativo al estudiante.
- `/progreso` muestra el primer paso recomendado.
- El tutor recibe el contexto adaptativo cuando responde preguntas como “qué debería estudiar”.

## Migración creada

`supabase/migrations/202609220004_sprint9_adaptive_learning.sql`

Tablas:

- `student_mastery_estimates`
- `adaptive_recommendations`
- `adaptive_learning_events`

Las tablas tienen RLS habilitado. Los estudiantes leen solo sus datos y el `service_role` escribe mediante backend seguro.

## Endpoints

- `GET /api/adaptive/mastery`
- `GET /api/adaptive/learning-gaps`
- `GET /api/adaptive/recommendations`
- `POST /api/adaptive/recommendations/[id]/accept`
- `POST /api/adaptive/recommendations/[id]/postpone`
- `POST /api/adaptive/recommendations/[id]/dismiss`
- `POST /api/adaptive/recommendations/[id]/complete`

## Estados de dominio

- `INSUFFICIENT_EVIDENCE`
- `INITIAL`
- `DEVELOPING`
- `CONSOLIDATED`

## Validación local

Ejecutar:

```bash
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

## Producción

No aplicar esta migración ni desplegar producción sin autorización explícita. El sprint exige validar localmente y esperar antes de producción.
