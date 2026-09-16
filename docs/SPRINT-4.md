# Informe Sprint 4 - 15 de septiembre de 2026

## Estado

Sprint 4 implementa el Simulacro de Examen Oral para Unidad 1 - Doctrina Policial. Reutiliza el RAG de Sprint 2 para formular preguntas, repreguntas y evaluacion. No se cargaron otras unidades, no se implemento tribunal IA multiagente, gamificacion ni analitica avanzada.

## Funcionalidades implementadas

- `/simulacro` deja de ser pantalla pendiente y permite iniciar una practica oral.
- El sistema genera una pregunta inicial basada en fragmentos RAG de Unidad 1.
- El estudiante puede responder por escrito o grabar voz para transcripcion.
- El sistema genera una repregunta basada en la respuesta y el contexto recuperado.
- Tras la segunda respuesta, genera evaluacion final con rubrica 100 puntos.
- El resultado muestra fortalezas, aspectos a mejorar, respuesta sugerida y temas de repaso.
- El consumo se registra en `usage_events` con `simulation_id`.
- El dashboard del estudiante muestra tutor y simulacro como disponibles.

## Archivos creados o modificados

- `src/app/simulacro/page.tsx`
- `src/components/simulation-panel.tsx`
- `src/app/actions/simulacro.ts`
- `src/app/api/simulacro/voice/transcribe/route.ts`
- `src/lib/simulations/oral-exam.ts`
- `src/prompts/simulation-system.ts`
- `src/components/student-dashboard.tsx`
- `src/app/globals.css`
- `tests/e2e/auth/session.spec.ts`
- `tests/e2e/local/supabase.spec.ts`
- `README.md`
- `docs/ARCHITECTURE.md`

## Tablas utilizadas

No se creo migracion nueva. Se usaron tablas ya creadas en Sprint 1:

- `study_sessions`
- `simulations`
- `simulation_questions`
- `simulation_results`
- `usage_events`

## Modelos usados

- Generacion de preguntas, repreguntas y evaluacion: `OPENAI_MODEL`, por defecto `gpt-4.1-mini`.
- Transcripcion opcional de respuesta oral: `OPENAI_STT_MODEL`, por defecto `gpt-4o-mini-transcribe`.

## Rúbrica

- Dominio conceptual: 30 puntos.
- Precision terminologica: 20 puntos.
- Aplicacion: 20 puntos.
- Argumentacion: 20 puntos.
- Claridad: 10 puntos.

## Prueba real realizada

Flujo probado como estudiante real contra Supabase remoto:

1. Login en `/login`.
2. Entrada a `/simulacro`.
3. Inicio de simulacro.
4. Pregunta generada: "Cómo define la doctrina institucional en la Policía Boliviana y cuál es su importancia para orientar el pensamiento y la conducta del servidor policial?"
5. Respuesta del estudiante enviada.
6. Repregunta generada: "Podrías explicar cómo se relacionan los principios y valores de la doctrina policial con la conducta diaria del servidor policial?"
7. Segunda respuesta enviada.
8. Evaluacion recibida con puntaje `61/100`, rubrica visible y respuesta sugerida.

Tiempo total aproximado del flujo: 33.53 segundos.

## Pendientes

- Falta prueba en Android fisico con microfono real y origen HTTPS.
- La evaluacion es de un evaluador IA simple, no tribunal IA multirol.
- No hay simulacro completo de muchas rondas; el demo actual tiene pregunta inicial, repregunta y evaluacion final.
- Las otras 14 unidades siguen fuera del alcance.

## Validacion

La validacion completa se ejecuta despues de este informe y queda registrada en la respuesta final del sprint.
