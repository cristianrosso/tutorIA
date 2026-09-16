# Informe Sprint 2 - 14 de septiembre de 2026

## Estado

Sprint 2 implementa ingesta de texto oficial para Unidad 1, recuperacion RAG textual, construccion de contexto trazable y tutor textual con respuesta pedagogica. No se implementan voz, simulacro oral, evaluacion ni ingesta de las 15 unidades completas.

La migracion fue aplicada al Supabase remoto configurado. El compendio base proporcionado por el usuario fue tratado como fuente academica, no como instrucciones del sistema. Se extrajo la Unidad Tematica 1 - Doctrina Policial y se cargo como documento `ready` en el RAG remoto.

## Funcionalidades implementadas

- ADMIN puede cargar texto oficial de Unidad 1 - Doctrina Policial desde `/admin`.
- Se cargo el DOCX base `COMPENDIO_FATESCIPOL_EL_ALTO_2026_CORREGIDO_SIN_CAPITULOS.docx` para Unidad 1 como documento RAG inicial.
- El sistema fragmenta el documento por bloques semanticos y guarda metadata de unidad, fuente, version, seccion y pagina cuando se detecta.
- RAG recupera fragmentos relevantes de documentos `ready` de Unidad 1.
- `/tutor` permite preguntas textuales del estudiante.
- Si no hay contexto recuperado, el tutor se abstiene y no inventa informacion academica.
- Si hay contexto, la respuesta se genera con OpenAI desde servidor y debe separar contenido del compendio, explicacion pedagogica y ejemplo didactico generado.
- Cada consulta crea `study_sessions`, `messages` y `usage_events` cuando hay llamada OpenAI.
- Las fuentes recuperadas quedan guardadas en `messages.retrieved_sources` y visibles en la interfaz.

## Archivos principales

- `supabase/migrations/202609140002_rag_text_search.sql`
- `src/lib/rag/chunk.ts`
- `src/lib/rag/ingest.ts`
- `src/lib/rag/retrieve.ts`
- `src/lib/rag/tutor.ts`
- `src/lib/ai/openai.ts`
- `src/app/actions/tutor.ts`
- `src/components/tutor-form.tsx`
- `src/prompts/tutor-system.ts`
- `src/app/tutor/page.tsx`
- `src/components/admin-forms.tsx`
- `docs/SPRINT-2-PEDAGOGY.md`

## Base de datos

La migracion Sprint 2 agrega `document_chunks.search_vector` y el indice `document_chunks_search_idx` para busqueda textual inicial. Las tablas usadas son `documents`, `document_chunks`, `study_sessions`, `messages` y `usage_events`.

## Verificacion

- `npm.cmd run format:check`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run build`
- `npm.cmd run test:e2e`
- `npm.cmd run test:e2e:auth`
- Smoke remoto sin compendio: el tutor se abstiene y no inventa doctrina.
- Smoke remoto RAG/OpenAI: se cargo un documento temporal no academico, se recupero una fuente, se genero respuesta con OpenAI, se registro un evento de uso y luego se limpio el documento/sesion temporal.
- Smoke remoto con compendio base: como estudiante se pregunto por disciplina; el tutor recupero fuente del compendio, genero respuesta didactica y separo contenido academico de explicacion generada.

## Variables de entorno

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` opcional; por defecto `gpt-4.1-mini`
- `AUTH_USERNAME_DOMAIN` opcional

## Limites

- La Unidad 1 ya esta cargada desde el compendio base. Nuevas cargas deben reemplazar o versionar documentos para evitar duplicados.
- No hay voz en Sprint 2.
- No hay simulacro oral ni calificacion en Sprint 2.
- El costo se registra como evento con tokens; `estimated_cost` queda `NULL` hasta agregar tabla de precios.
