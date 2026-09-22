# Sprint 8 — Simulador inteligente de examen de grado

Este sprint agrega un simulador escrito para practicar el Examen de Grado FATESCIPOL sin activar voz. El flujo utiliza el generador de preguntas y el corrector académico de Sprint 7, por lo que las preguntas, respuestas orientativas, retroalimentación y fuentes se basan en el RAG académico existente.

## Flujo implementado

1. El estudiante configura modalidad, unidad o tema, tipo de pregunta, dificultad, cantidad y tiempo.
2. El sistema crea un `exam_session` y genera preguntas usando sesiones formativas internas.
3. El examen se inicia con estado `in_progress` y, si corresponde, con `deadline_at`.
4. El estudiante responde y guarda cada respuesta. No se muestra corrección durante el examen.
5. Al finalizar, el sistema corrige las respuestas con `gradeAssessmentAnswer()` y calcula resultado global.
6. La pantalla muestra puntaje, recomendaciones, corrección, respuesta correcta orientativa, explicación y fuentes.

## Endpoints

- `POST /api/exams/create`
- `POST /api/exams/start`
- `GET /api/exams/history`
- `GET /api/exams/[id]`
- `POST /api/exams/[id]/answer`
- `POST /api/exams/[id]/submit`
- `GET /api/exams/[id]/results`

## Tablas agregadas

Migración: `supabase/migrations/202609220003_sprint8_exam_simulator.sql`

- `exam_sessions`
- `exam_session_questions`
- `exam_session_answers`
- `exam_results`

Todas tienen RLS activado. Los estudiantes solo leen sus propios exámenes activos; el rol de servicio realiza escrituras desde los endpoints seguros.

## Rutas de interfaz

- `/simulacro`: simulador escrito principal.
- `/examenes`: historial de simulacros.
- `/examenes/[id]/resultados`: revisión del resultado final.

## Reglas pedagógicas

- No se muestra retroalimentación durante el examen.
- La corrección final reutiliza el motor de Sprint 7 para comparar la respuesta del estudiante con conceptos esperados y fuentes académicas.
- Las respuestas no contestadas quedan registradas como pendientes o sin respuesta.
- El modo tribunal usa preguntas abiertas.
- El simulacro integral distribuye preguntas entre unidades seleccionadas.

## Pendiente operativo

Antes de usar esta versión en Vercel se debe aplicar la migración SQL en Supabase y desplegar el commit correspondiente.
