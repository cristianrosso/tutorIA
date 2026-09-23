# Sprint 21 — Optimización de costos y consumo tecnológico

## Estado inicial auditado

Rama de partida: `main`.

Commit de partida: `850caf0 Implement Sprint 20 security hardening`.

Antes de modificar código se creó un punto de recuperación local:

- rama: `backup/sprint21-cost-optimization-start-20260923-105427`

No se ejecutaron migraciones destructivas. No se desplegó producción durante la implementación local de este sprint.

## Alcance implementado

Sprint 21 fortalece la medición económica sin reducir la calidad pedagógica ni cambiar la arquitectura conectada de Next.js, Supabase, Vercel y OpenAI.

La implementación agrega:

- catálogo centralizado de tarifas por modelo y tipo de operación;
- cálculo unificado para texto, tokens cacheados, embeddings, STT y TTS;
- resumen administrativo por estudiante, modelo, funcionalidad y día observado;
- proyección del costo del periodo de licencia;
- alertas administrativas por umbrales de presupuesto;
- desglose explícito de costo directo de IA, voz e infraestructura distribuida;
- actualización del lenguaje económico de mensual a periodo de licencia.

## Cálculo centralizado de costos

Se actualizó `src/lib/ai/costs.ts` para resolver tarifas mediante variables de entorno y una versión de precios.

Modelos cubiertos inicialmente:

- `gpt-5.6-luna`;
- `gpt-5.6-terra`;
- `gpt-4o-mini-transcribe` y modelos que incluyan `transcribe`;
- `gpt-4o-mini-tts`, `tts-1`, `tts-1-hd` y modelos que incluyan `tts`;
- `text-embedding-3-small`;
- fallback textual configurable.

El sistema permite configurar:

- entrada por 1M tokens;
- entrada cacheada por 1M tokens;
- salida por 1M tokens;
- audio de entrada por minuto;
- audio de salida por minuto;
- audio de salida por caracteres para modelos que facturan de esa forma;
- embeddings por 1M tokens;
- versión de precios.

No se modifican costos históricos ya registrados.

## Panel administrativo

Se amplió `/admin/usage` para mostrar:

- operaciones IA registradas;
- costo directo de IA;
- costo de voz;
- proyección del periodo;
- alertas por umbral;
- estimación agregada para 400 estudiantes;
- costo por funcionalidad;
- costo por modelo;
- detalle por estudiante;
- catálogo de tarifas efectivo.

Las alertas son informativas. No suspenden automáticamente estudiantes.

## Periodo económico

El fallback de duración de licencia cambió a 40 días, manteniendo la configuración editable desde administración.

Los textos de configuración ahora hablan de presupuesto del periodo en lugar de presupuesto mensual, para alinearse con el modelo operativo vigente.

## Datos observados y proyecciones

El panel diferencia:

- costo observado desde `ai_usage_events`;
- infraestructura distribuida desde configuración;
- promedio diario observado;
- proyección hasta el final del periodo;
- estimación agregada para la población esperada.

La proyección no se presenta como factura definitiva. Depende de los días observados y del patrón real de uso.

## Optimización aplicada sin pérdida académica

No se redujo el contenido pedagógico ni se cambió el motor RAG. El sprint se limita a medir y proyectar mejor el consumo para tomar decisiones informadas.

La optimización real de prompts, RAG y modelos deberá hacerse con pruebas comparativas de calidad académica antes de cambiar respuestas del tutor.

## Validación

Se agregó `tests/sprint21-cost-optimization.test.ts` para comprobar:

- cálculo por modelo textual;
- efecto de tokens cacheados;
- costo separado de voz de entrada y salida;
- tarifa versionada para embeddings.

## Variables de entorno relevantes

- `AI_PRICING_VERSION`;
- `USD_TO_BOB_ACCOUNTING_RATE`;
- `OPENAI_TEXT_INPUT_COST_PER_1M`;
- `OPENAI_TEXT_OUTPUT_COST_PER_1M`;
- `OPENAI_CACHED_INPUT_COST_PER_1M`;
- `OPENAI_LUNA_INPUT_COST_PER_1M`;
- `OPENAI_LUNA_CACHED_INPUT_COST_PER_1M`;
- `OPENAI_LUNA_OUTPUT_COST_PER_1M`;
- `OPENAI_TERRA_INPUT_COST_PER_1M`;
- `OPENAI_TERRA_CACHED_INPUT_COST_PER_1M`;
- `OPENAI_TERRA_OUTPUT_COST_PER_1M`;
- `OPENAI_STT_COST_PER_MINUTE`;
- `OPENAI_TTS_COST_PER_MINUTE`;
- `OPENAI_TTS_COST_PER_1M_CHARS`;
- `OPENAI_EMBEDDING_COST_PER_1M`;
- `STUDENT_LICENSE_DURATION_DAYS`;
- `STUDENT_PERIOD_BUDGET_BOB`;
- `EXPECTED_STUDENTS`;
- `INFRASTRUCTURE_MONTHLY_BOB`.

## Limitaciones conocidas

Las tarifas por defecto son configurables y deben revisarse contra el panel real del proveedor antes de hacer conciliación contable.

No se implementó una prueba de carga para 400 estudiantes simultáneos.

No se cambió el router de modelos. Cualquier cambio de modelo debe validarse con pruebas de calidad académica.

No se agregó una tabla nueva de precios para evitar migraciones innecesarias en este sprint. Si se requiere administración histórica completa de tarifas desde Supabase, debe añadirse en un sprint posterior con migración no destructiva.

## Reversión

Para volver al estado anterior:

```powershell
git checkout backup/sprint21-cost-optimization-start-20260923-105427
```

Para reversión selectiva, retirar:

- cambios en `src/lib/ai/costs.ts`;
- cambios en `src/lib/billing/ai-usage.ts`;
- cambios en `/admin/usage`;
- cambios de etiquetas en el formulario económico;
- `tests/sprint21-cost-optimization.test.ts`;
- esta documentación y la sección del README.
