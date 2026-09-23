# Sprint 18 — Gestión avanzada del conocimiento académico

Este sprint agrega un flujo administrativo para cargar, versionar, procesar, validar, publicar y revertir documentos académicos sin modificar el contenido oficial del compendio.

## Rutas agregadas

- `/admin/knowledge`: centro de conocimiento académico.
- `/admin/knowledge/documents`: catálogo y carga de documentos.
- `/admin/knowledge/documents/[id]`: gestión de versiones, procesamiento, publicación y rollback.
- `/admin/knowledge/rag-test`: prueba de recuperación RAG para documentos publicados.

## Migración requerida

Antes de usar el módulo en Vercel/Supabase, ejecutar en Supabase SQL Editor:

`supabase/migrations/202609230003_sprint18_knowledge_management.sql`

La migración es no destructiva. Crea tablas administrativas, historial de trabajos, publicaciones, casos de validación y un bucket privado `academic-documents`.

## Flujo operativo

1. El administrador carga un PDF, DOCX o TXT.
2. El sistema calcula `source_hash` y rechaza duplicados exactos.
3. El archivo se guarda en Storage privado.
4. La acción **Procesar** extrae texto y genera fragmentos semánticos, conservando el texto fuente.
5. La acción **Publicar al RAG** crea `academic_documents`, `academic_units`, `academic_topics`, `knowledge_objects` y `knowledge_chunks`.
6. La acción **Revertir** desactiva el `academic_document` publicado y conserva el historial.

## Reglas académicas aplicadas

- `source_content` se conserva desde el texto extraído.
- No se generan embeddings masivos en esta etapa.
- No se reemplaza el RAG existente; se alimenta la estructura MKF-1 ya usada por el RAG académico.
- El contenido sin unidad o con baja estructura queda marcado como revisión requerida.
- Los ejemplos, pedagogía y metadatos generados se separan del texto fuente.

## Validación recomendada

- Cargar primero un documento corto TXT de prueba.
- Procesarlo y revisar el reporte de validación.
- Publicarlo y consultar `/admin/knowledge/rag-test`.
- Confirmar que el tutor recupera la fuente esperada antes de publicar documentos grandes.
