# Sprint 11 · Tutor pedagógico multinivel

Este sprint añade una capa pedagógica intermedia al tutor conversacional existente. No reemplaza el RAG académico, no crea un segundo endpoint de chat y no modifica el contenido oficial del compendio.

## Flujo implementado

1. El estudiante escribe o dicta una pregunta en `/tutor`.
2. La ruta existente `POST /api/tutor/chat` recibe la consulta.
3. `generateTutorResponse()` conserva el flujo de los sprints anteriores: conversación, memoria, motor adaptativo, plan de estudio, RAG y generación con OpenAI.
4. Antes de construir el prompt se ejecuta la capa pedagógica:
   - detección de modo por selector o lenguaje natural;
   - lectura de preferencia pedagógica del estudiante cuando existe;
   - selección determinista de estrategia;
   - construcción del prompt multinivel;
   - registro de interacción pedagógica.
5. La respuesta conserva fuentes recuperadas por RAG y sugerencias de seguimiento.

## Modos pedagógicos

- `quick`: respuesta breve y directa.
- `simple`: explicación sencilla y progresiva.
- `academic`: explicación formal con elementos académicos.
- `deep`: explicación con mayor desarrollo y relaciones.
- `example`: ejemplo didáctico contextualizado y conexión con el concepto.
- `review`: repaso para examen con ideas clave y comprobación.
- `comparison`: comparación conceptual respaldada por fuentes.
- `step_by_step`: explicación de procesos, fases o procedimientos.

El modo heredado `explain` se conserva por compatibilidad y se normaliza como explicación sencilla.

## Estrategias pedagógicas

El selector usa reglas deterministas para evitar llamadas adicionales a OpenAI:

- `DIRECT_EXPLANATION`
- `PROGRESSIVE_EXPLANATION`
- `CONCEPTUAL_BREAKDOWN`
- `PRACTICAL_EXAMPLE`
- `COMPARATIVE_EXPLANATION`
- `PROCEDURAL_EXPLANATION`
- `ACTIVE_RECALL`
- `GUIDED_REVIEW`

## Archivos principales

- `src/lib/pedagogy/types.ts`
- `src/lib/pedagogy/mode-detector.ts`
- `src/lib/pedagogy/strategy-selector.ts`
- `src/lib/pedagogy/example-builder.ts`
- `src/lib/pedagogy/prompt-builder.ts`
- `src/lib/pedagogy/preferences.ts`
- `src/lib/tutor/tutor-service.ts`
- `src/components/tutor/tutor-chat.tsx`
- `src/app/api/tutor/chat/route.ts`
- `src/app/api/tutor/voice/respond/route.ts`
- `src/app/api/tutor/voice/text/route.ts`

## Migración SQL

`supabase/migrations/202609220006_sprint11_multilevel_pedagogy.sql`:

- amplía el `check` de `tutor_messages.tutor_mode`;
- amplía el `check` de `student_academic_profiles.preferred_learning_mode`;
- crea `student_pedagogical_preferences`;
- crea `pedagogical_interactions`;
- habilita RLS;
- permite lectura al dueño del dato y a administradores;
- conserva escritura por `service_role` desde backend seguro.

## Reglas de seguridad académica

El prompt multinivel exige:

- usar el contexto RAG como fuente principal;
- no inventar normativa, artículos, fechas, sanciones, competencias ni definiciones oficiales;
- diferenciar contenido del compendio, explicación generada y ejemplo didáctico;
- marcar ejemplos generados como `Ejemplo didáctico`;
- abstenerse cuando falte fuente suficiente.

## Interfaz

En `/tutor` se añadió:

- selector visible de modo pedagógico;
- accesos rápidos por modo;
- repreguntas que envían el modo adecuado;
- botón `Practicar este tema` que abre el sistema de práctica existente para la unidad actual.

## Pruebas añadidas

`tests/pedagogy-sprint11.test.ts` valida:

- detección de modos por lenguaje natural;
- prioridad de selección manual del estudiante;
- selección de estrategia sin IA adicional;
- prompt con separación de fuente y ejemplo didáctico;
- límites de tokens por modo.
