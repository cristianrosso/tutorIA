# Sprint 10 — Plan de estudio inteligente y personalizado

Este sprint agrega un planificador académico personalizado para Tutor IA FATESCIPOL. Reutiliza MKF-1, progreso académico, evidencias de evaluación, simulacros y el motor adaptativo del Sprint 9.

## Arquitectura

- `src/lib/study-plan/availability-calculator.ts`: calcula días y minutos disponibles entre inicio y examen.
- `src/lib/study-plan/workload-estimator.ts`: estima carga académica por tema con reglas locales.
- `src/lib/study-plan/schedule-generator.ts`: consulta contenidos reales, progreso y recomendaciones adaptativas para distribuir actividades.
- `src/lib/study-plan/study-plan-service.ts`: guarda borradores, activa planes, completa actividades y reprograma pendientes.
- `src/lib/study-plan/study-plan-context.ts`: entrega un resumen pequeño al Tutor para consultas como “qué me toca estudiar hoy”.
- `/plan-estudio`: interfaz para configurar, revisar, activar y seguir el cronograma.
- `/student/study-plan`: redirige a `/plan-estudio` por compatibilidad con el sprint.

## Modelo de datos

Migración: `supabase/migrations/202609220005_sprint10_study_planner.sql`

Tablas:

- `student_study_plans`
- `student_study_availability`
- `student_study_activities`
- `student_study_plan_revisions`

Estados del plan:

- `draft`
- `active`
- `paused`
- `completed`
- `cancelled`
- `expired`

Estados de actividad:

- `pending`
- `in_progress`
- `completed`
- `postponed`
- `skipped`
- `cancelled`

Tipos de actividad:

- `STUDY_TOPIC`
- `REVIEW_TOPIC`
- `PRACTICE_QUESTIONS`
- `FORMATIVE_ASSESSMENT`
- `EXAM_SIMULATION`
- `REVIEW_MISTAKES`

## Algoritmo de planificación

1. Valida fecha de inicio, fecha de examen, disponibilidad y unidades.
2. Consulta unidades y temas reales desde MKF-1.
3. Consulta progreso del estudiante en `student_topic_progress`.
4. Consulta recomendaciones adaptativas existentes/generadas por Sprint 9.
5. Calcula minutos disponibles con zona horaria `America/La_Paz`.
6. Estima carga por tema con reglas configurables.
7. Prioriza temas con dificultades y contenidos pendientes.
8. Agrega prácticas, repasos, evaluaciones formativas y simulacros sin generar preguntas por adelantado.
9. Distribuye actividades por fecha respetando minutos y máximo de actividades diarias.
10. Marca advertencia si el tiempo es insuficiente.

## Integraciones

- Tutor: recibe un resumen corto del plan real, no todo el cronograma.
- Práctica: las actividades enlazan a `/practica`.
- Simulacro: las actividades enlazan a `/simulacro`.
- Tutor/RAG: las actividades de estudio enlazan a `/tutor` por unidad.
- Motor adaptativo: sus recomendaciones aumentan prioridad y refuerzo.

## Control de costos

El planificador no llama a OpenAI. Solo consulta Supabase y ejecuta reglas locales. Las preguntas, simulacros y tutor se inician cuando el estudiante abre la actividad.

## Limitaciones conocidas

- La vista de calendario es una lista por día; una vista mensual visual avanzada queda para un sprint posterior.
- La reprogramación aplica una redistribución simple de pendientes; no implementa repetición espaciada avanzada.
- La selección específica de subtemas está preparada en API, pero la UI inicial prioriza selección por unidades.

## Validación

Ejecutar:

```bash
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
```

## Producción

No aplicar esta migración ni desplegar producción sin autorización explícita del responsable del proyecto.
