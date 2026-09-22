# Sprint 7 — Sistema de evaluación formativa

## Arquitectura

El Sprint 7 agrega una capa de evaluación formativa sobre el RAG académico y la memoria del estudiante:

1. El estudiante selecciona unidad, tema, tipo, dificultad y cantidad en `/practica`.
2. `POST /api/assessment/create` valida sesión y parámetros.
3. `createAssessmentSession()` recupera contexto oficial con `retrieveAcademicContext()`.
4. OpenAI genera preguntas estructuradas; Zod valida la estructura.
5. Las respuestas correctas, rúbricas y explicaciones se guardan solo en servidor en `assessment_questions`.
6. El navegador recibe únicamente preguntas públicas desde `assessment_session_questions.question_snapshot`.
7. `POST /api/assessment/answer` corrige en servidor y recién devuelve retroalimentación.
8. Cada respuesta registra evidencia en `student_learning_evidence`, evento en `student_learning_events`, progreso en `student_topic_progress` y consumo en `ai_usage_events` cuando se usa IA.

## Tipos de preguntas

- `multiple_choice`: corrección determinista, cuatro alternativas.
- `true_false`: corrección determinista.
- `short_answer`: comparación semántica controlada con conceptos esperados.
- `open_answer`: rúbrica formativa con IA.
- `case_application`: rúbrica formativa con IA; el caso debe tratarse como didáctico generado.

## Niveles

- `basic`: definición, identificación, reconocimiento.
- `intermediate`: explicación, relación, comparación.
- `advanced`: aplicación, análisis y casos breves.

## Modelo de datos

Migración: `supabase/migrations/202609220002_sprint7_formative_assessment.sql`.

Tablas:

- `assessment_questions`
- `assessment_sessions`
- `assessment_session_questions`
- `assessment_answers`

La migración activa RLS. Los usuarios autenticados solo leen sus sesiones/respuestas; `service_role` realiza escrituras de servidor.

## Endpoints

- `POST /api/assessment/create`
- `POST /api/assessment/answer`
- `GET /api/assessment/session/[id]`
- `GET /api/assessment/results/[id]`
- `GET /api/assessment/history`

Todos requieren estudiante autenticado y verifican propiedad de sesión.

## Seguridad

El navegador no recibe `correct_answer`, `expected_answer` ni `rubric` antes de responder. La corrección no confía en `isCorrect` enviado desde cliente; todo se calcula en servidor.

## Integración con memoria

Después de cada respuesta se actualiza:

- `student_learning_evidence`
- `student_learning_events`
- `student_topic_progress`
- `student_academic_profiles.current_unit_id/current_topic_id/last_studied_at`

Un tema no se marca como dominado por una única respuesta correcta; el dominio se calcula solo cuando hay varias evidencias.

## Costos

La generación de preguntas y la corrección con IA registran operación `evaluation` en `ai_usage_events`. Opción múltiple, verdadero/falso y respuesta corta no realizan llamadas adicionales a OpenAI para corregir.

## Pruebas ejecutadas

- `npm.cmd run typecheck`
- `npm.cmd run test -- assessment-sprint7.test.ts`

Las pruebas cubren corrección determinista, respuesta incorrecta, verdadero/falso, equivalencia semántica y respuesta parcial.

## Limitaciones conocidas

- La generación depende de `OPENAI_API_KEY` y del contenido disponible en el RAG.
- La validación académica automática reduce errores, pero no reemplaza revisión docente.
- La evaluación desde el chat queda preparada conceptualmente mediante el motor reutilizable, pero la interfaz conversacional no inicia sesiones automáticamente en esta entrega.
- No se implementa el simulador completo de examen de grado ni examen oral por voz; corresponde al Sprint 8.

## Aplicar migración

Local o producción controlada:

```powershell
npx.cmd supabase db push --db-url $dbUrl
```

No contiene `drop table` ni operaciones destructivas.
