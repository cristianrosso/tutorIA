# Arquitectura RAG Académica MKF-1 — Sprint 5B

El Sprint 5B agrega un motor RAG académico para Tutor IA FATESCIPOL. No reemplaza el compendio original ni modifica el significado académico. El compendio sigue siendo la fuente maestra; MKF-1 organiza el contenido y el RAG lo recupera con trazabilidad.

## Capas

1. **Fuente oficial**: `source_content` / `source_text` preservado desde el compendio.
2. **Capa de conocimiento MKF-1**: `knowledge_objects`, `knowledge_relations`, `knowledge_chunks`.
3. **Recuperación RAG**: embeddings, búsqueda textual, score académico, reranking, expansión parent-child y relaciones.
4. **Context Builder**: entrega contexto limpio al modelo, separando fuente oficial de explicaciones o ejemplos generados.

## Migración

La migración `supabase/migrations/202609170001_mkf1_rag_engine.sql` agrega:

- soporte opcional `pgvector` si está disponible;
- columnas RAG a `knowledge_chunks`;
- índice Full Text Search en español;
- índice vectorial `ivfflat` cuando existe `vector`;
- RPC `match_knowledge_chunks()` para búsqueda semántica.

La migración es compatible con pruebas locales sin pgvector: omite vector/RPC cuando la extensión no existe.

## Embeddings

Servicio: `src/lib/ai/embeddings.ts`

- `generateEmbedding(text)`
- `generateEmbeddingsBatch(texts)`
- hash normalizado para evitar regenerar embeddings si el contenido no cambió.

Variables:

```env
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536
RAG_DEBUG=false
```

## Indexación

Comando:

```powershell
npm run knowledge:index
```

El indexador:

1. lee documentos activos y `document_chunks`;
2. crea o actualiza `academic_documents`, `academic_units`, `academic_topics` y `knowledge_objects`;
3. crea `knowledge_chunks` académicos;
4. genera embeddings por lotes;
5. guarda vector, hash, keywords, metadata y trazabilidad;
6. evita duplicados usando `knowledge_id`, `source_hash`, `embedding_hash` y modelo.

## Búsqueda híbrida

Servicio principal: `src/lib/knowledge/rag.ts`

```ts
retrieveAcademicContext(query, options)
```

Flujo:

1. `analyzeQuery()` detecta intención académica.
2. `generateEmbedding()` genera vector de consulta.
3. `hybridSearch()` combina búsqueda semántica, textual y score académico.
4. `rerankCandidates()` reordena por relevancia local.
5. `expandParentChild()` agrega contexto padre.
6. `expandRelations()` agrega relaciones MKF-1 de profundidad 1.
7. `buildAcademicContext()` produce `<academic_context>` con fuentes trazables.

Score conceptual:

```text
final_score = 0.60 semantic_score + 0.25 lexical_score + 0.15 academic_score
```

Los pesos son configurables por opciones.

## Diagnóstico

Endpoint protegido por administrador:

```http
POST /api/knowledge/search
```

Pantalla administrativa:

```text
/admin/knowledge/search
```

Muestra intención, resultados, score semántico, textual, académico, final, unidad, tema, fuente, contexto y debug técnico si está activo.

## Seguridad

- `OPENAI_API_KEY` solo servidor.
- `SUPABASE_SECRET_KEY` solo servidor.
- No hay claves `NEXT_PUBLIC` para secretos.
- Endpoint protegido con `requireAdmin()`.

## Pruebas

Consultas mínimas para validar manualmente:

- ¿Qué es liderazgo?
- ¿Cuáles son las características del liderazgo?
- Explícame la diferencia entre oficio y memorándum.
- ¿Qué es archivística?
- ¿Cuál es la importancia del archivo?
- Explícame este concepto con un ejemplo.
- Prepárame una pregunta sobre correspondencia policial.
