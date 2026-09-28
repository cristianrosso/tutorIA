# Sprint 22B · Arquitectura multi-producto

Tutor IA FATESCIPOL queda preparado para operar varios cursos, exámenes o preparaciones dentro del mismo código y del mismo motor pedagógico. El producto inicial es `fatescipol-grado`; todo el contenido existente se conserva y se etiqueta con ese producto mediante una migración no destructiva.

## Principios implementados

- Un producto académico agrupa institución, examen, gestión, configuración de tutor, configuración de simulacro y branding.
- El contenido oficial se mantiene separado por `product_id` en las tablas heredadas y en MKF-1.
- El RAG acepta `productId` como filtro opcional y usa una RPC nueva para búsqueda semántica por producto cuando la migración está aplicada.
- Las licencias por producto se almacenan en `user_product_licenses`; las licencias heredadas se copian hacia FATESCIPOL sin modificar registros históricos.
- El panel administrativo incorpora `/admin/products` para crear productos contenedores. Crear un producto no crea contenido académico ni unidades inventadas.
- El estudiante tiene `/preparaciones` para ver sus accesos académicos.

## Base de datos

Migración nueva:

`supabase/migrations/202609280001_sprint22b_multi_product_architecture.sql`

Crea:

- `academic_categories`
- `academic_products`
- `product_tutor_configs`
- `product_exam_configs`
- `user_product_licenses`
- `admin_product_permissions`
- `product_audit_events`

Agrega `product_id` nullable y con índice a las tablas existentes de conocimiento, RAG, conversaciones, progreso, evaluación, simulacros, clases, plan de estudio, uso y administración. Luego etiqueta las filas existentes con FATESCIPOL.

La migración no agrega `NOT NULL`, no elimina columnas y no borra datos.

## Producto inicial

Identificador fijo:

- `id`: `00000000-0000-4000-8000-000000000101`
- `slug`: `fatescipol-grado`
- `name`: `FATESCIPOL — Examen de Grado 2026`

Este identificador estable permite que reportes, scripts y filtros usen FATESCIPOL como base sin depender de inserciones aleatorias.

## RAG y aislamiento

Las funciones actuales siguen funcionando sin `productId`. Para nuevas consultas multi-producto, pasar:

```ts
await retrieveAcademicContext("pregunta", {
  productId: "00000000-0000-4000-8000-000000000101",
  unitNumber: 1,
});
```

La búsqueda heredada también acepta:

```ts
await retrieveContext("pregunta", 1, {
  productId: "00000000-0000-4000-8000-000000000101",
});
```

Cuando `productId` está presente, el RAG filtra por producto en búsqueda lexical, expansiones parent-child, relaciones y recuperación heredada. La búsqueda semántica usa `match_knowledge_chunks_by_product`.

## Interfaz

- Admin: `/admin/products`
- Estudiante: `/preparaciones`
- API admin: `GET /api/admin/products`, `POST /api/admin/products`, `PATCH /api/admin/products/:id`

## Rendimiento

`scripts/performance-load.mjs` acepta:

```bash
npm.cmd run perf:load -- --product-slug fatescipol-grado
npm.cmd run perf:load -- --product-id 00000000-0000-4000-8000-000000000101
```

También reconoce `PERFORMANCE_PRODUCT_SLUG` y `PERFORMANCE_PRODUCT_ID`.

## Límites de esta entrega

Esta entrega prepara la arquitectura y el aislamiento. No realiza ingesta de nuevos compendios, no crea unidades para otros cursos y no despliega a producción por la restricción explícita del sprint.
