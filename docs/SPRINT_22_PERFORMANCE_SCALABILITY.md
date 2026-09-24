# Sprint 22 — Rendimiento, concurrencia y escalabilidad

## Estado inicial auditado

Rama de partida: `main`.

Commit de partida: `ff2e5a7 Implement Sprint 21 cost optimization`.

Antes de modificar código se creó un punto de recuperación local:

- rama: `backup/sprint22-performance-start-20260924-085556`

No se ejecutaron pruebas de estrés contra producción. No se ejecutaron pruebas intensivas con OpenAI real. No se tocaron datos académicos reales ni se ejecutaron migraciones destructivas.

## Arquitectura revisada

La aplicación mantiene la arquitectura conectada:

- Next.js 16 App Router;
- Vercel;
- Supabase/PostgreSQL;
- OpenAI API;
- RAG académico MKF-1;
- tutor conversacional;
- tutor por voz;
- evaluación, simulacros, modo clase, analítica y costos.

Se revisaron puntos de consumo en:

- `src/lib/ai/openai.ts`;
- servicios de tutor, evaluación, simulacros y clase;
- endpoints `/api/tutor/*`, `/api/exams/*`, `/api/assessment/*`, `/api/classes/*`, `/api/*/voice/*`;
- rate limiting persistente existente en `src/lib/auth/rate-limit.ts`;
- registro de costos de Sprint 21.

## Inventario de endpoints

Se agregó el script:

```powershell
npm.cmd run perf:inventory
```

Genera:

- `docs/performance/sprint22-endpoints.json`

Resultado actual:

| Categoría | Endpoints |
|---|---:|
| admin | 10 |
| analytics | 6 |
| application | 21 |
| evaluation | 12 |
| rag_ai | 3 |
| voice | 10 |

Total inventariado: 62 endpoints.

El inventario marca por endpoint:

- ruta;
- métodos HTTP;
- categoría;
- uso de rate limiting;
- uso de OpenAI;
- uso del cliente privilegiado de Supabase.

## Simulador OpenAI seguro

Se agregó:

- `src/lib/performance/openai-simulator.ts`

El simulador se activa con:

```env
OPENAI_SIMULATION_MODE=true
```

Permite simular:

- texto;
- transcripción;
- síntesis de voz;
- latencia configurable;
- errores temporales;
- errores 429.

Variables principales:

```env
OPENAI_SIMULATED_TEXT_DELAY_MS=650
OPENAI_SIMULATED_STT_DELAY_MS=450
OPENAI_SIMULATED_TTS_DELAY_MS=500
OPENAI_SIMULATED_ERROR_RATE=0
OPENAI_SIMULATED_429_RATE=0
```

En modo simulado no se requiere `OPENAI_API_KEY` y no se consume OpenAI real.

## Control de capacidad OpenAI

Se agregó:

- `src/lib/performance/openai-capacity.ts`

Antes de llamar OpenAI real, `src/lib/ai/openai.ts` verifica capacidad con el rate limiter persistente existente en Supabase.

Controles iniciales:

- límite por modelo y tipo de operación;
- límites separados para texto, STT, TTS y embeddings;
- timeouts por operación;
- error operativo comprensible cuando se alcanza temporalmente la capacidad.

Variables principales:

```env
OPENAI_TEXT_RPM_LIMIT=450
OPENAI_STT_RPM_LIMIT=450
OPENAI_TTS_RPM_LIMIT=450
OPENAI_EMBEDDING_RPM_LIMIT=2500
OPENAI_TEXT_TIMEOUT_MS=45000
OPENAI_STT_TIMEOUT_MS=30000
OPENAI_TTS_TIMEOUT_MS=30000
OPENAI_EMBEDDING_TIMEOUT_MS=30000
```

También se admiten límites por modelo con el patrón:

```env
OPENAI_GPT_5_6_LUNA_RPM_LIMIT=450
```

Este control no afirma capacidad máxima de la plataforma. Solo evita sobrepasar límites operativos configurados desde la aplicación.

## Endpoint de simulación de rendimiento

Se agregó:

- `POST /api/performance/simulate`

El endpoint está protegido por `PERFORMANCE_TEST_TOKEN`. Si la variable no existe, devuelve 404.

Uso previsto:

- entorno local;
- preview/staging autorizado;
- pruebas de infraestructura sin datos privados;
- pruebas sin gasto OpenAI.

No debe habilitarse públicamente sin control operativo.

## Scripts de carga reproducibles

Se agregó:

```powershell
npm.cmd run perf:load -- --base-url http://127.0.0.1:3010 --token <TOKEN> --vus 25 --duration 60 --scenario local-smoke
```

El script mide:

- solicitudes completadas;
- solicitudes fallidas;
- errores por estado;
- solicitudes por segundo;
- solicitudes por minuto;
- concurrencia máxima observada;
- latencia promedio;
- p50;
- p95;
- p99.

Salida por defecto:

- `reports/performance/*.json`

## Escenarios progresivos preparados

Se agregó:

- `performance/sprint22-scenarios.json`

Niveles definidos:

| Nivel | Usuarios virtuales | Duración sugerida |
|---|---:|---:|
| 1 | 25 | 300 s |
| 2 | 50 | 300 s |
| 3 | 100 | 300 s |
| 4 | 200 | 300 s |
| 5 | 300 | 300 s |
| 6 | 400 | 300 s |

Distribución configurable de perfiles:

- lectura;
- tutor escrito;
- evaluación;
- simulacro;
- voz;
- actividad mixta.

Estos escenarios están preparados, no ejecutados contra producción.

## Prueba ejecutada

Se ejecutó una prueba local mínima de humo contra `http://127.0.0.1:3010` usando el endpoint simulado protegido.

Comando:

```powershell
$env:PERFORMANCE_TEST_TOKEN='local-smoke-token'
npm.cmd run perf:load -- --base-url http://127.0.0.1:3010 --token local-smoke-token --vus 5 --duration 5 --delay-ms 80 --think-ms 120 --scenario local-smoke --out reports/performance/sprint22-local-smoke.json
```

Resultado real:

| Métrica | Valor |
|---|---:|
| Modo | simulated-openai-free |
| Usuarios virtuales | 5 |
| Duración | 5 s |
| Solicitudes completadas | 37 |
| Solicitudes fallidas | 0 |
| Error rate | 0 % |
| RPS | 7.08 |
| RPM | 424.96 |
| Máxima concurrencia observada | 5 |
| Latencia promedio | 551.88 ms |
| p50 | 103.22 ms |
| p95 | 3401.24 ms |
| p99 | 3423.44 ms |

Interpretación:

- la prueba validó la herramienta y el endpoint protegido;
- no valida capacidad de 400 estudiantes;
- no valida calidad académica;
- no consume OpenAI real;
- p95/p99 quedaron inflados por la compilación inicial del servidor Next en modo desarrollo; después del calentamiento, las respuestas observadas estuvieron alrededor de 94–119 ms.

Resultado guardado en:

- `reports/performance/sprint22-local-smoke.json`

## Optimizaciones aplicadas

1. Simulación OpenAI sin gasto real para pruebas de infraestructura.
2. Control persistente de capacidad antes de llamar OpenAI real.
3. Timeouts configurables en llamadas de texto, STT y TTS.
4. Endpoint de prueba protegido y sin datos privados.
5. Inventario reproducible de endpoints críticos.
6. Scripts de carga sin dependencia externa adicional.

No se redujo la calidad pedagógica, no se modificó el contenido académico y no se desactivaron controles de seguridad.

## Cuellos de botella identificados

Pendientes de medición con staging autorizado:

- latencia real de RAG bajo concurrencia;
- latencia de Supabase con consultas vectoriales concurrentes;
- latencia de OpenAI real por modelo;
- comportamiento ante 429 reales;
- costo real de pruebas con voz;
- duración de funciones Vercel en producción/preview;
- persistencia de evaluaciones simultáneas.

El smoke test local mostró que el arranque/compilación de desarrollo distorsiona p95/p99. Las pruebas de capacidad deben ejecutarse sobre build de preview o staging, no sobre `next dev`.

## Plan de contingencia inicial

Ante alta demanda:

1. Detectar 429 o agotamiento de capacidad mediante errores del control OpenAI.
2. Mostrar mensaje: “El Tutor está atendiendo un número elevado de consultas. Intenta nuevamente en unos momentos.”
3. No duplicar consultas automáticamente.
4. Mantener la pregunta del estudiante en pantalla.
5. Registrar errores y consumo en los módulos existentes.
6. Usar el panel de costos para detectar consumo anómalo.
7. Ejecutar pruebas simuladas antes de aumentar límites o recursos.

## Pruebas pendientes con autorización

No ejecutadas todavía:

- niveles 25, 50, 100, 200, 300 y 400 usuarios contra staging;
- pruebas con OpenAI real;
- pruebas prolongadas de resistencia;
- pruebas de ráfagas contra login/simulacros;
- pruebas de voz real concurrente;
- pruebas de RAG con carga concurrente;
- pruebas de Vercel preview con métricas de función.

Estas pruebas requieren autorización explícita, entorno aislado, usuarios de prueba y presupuesto aprobado.

## Cómo ejecutar una prueba autorizada simulada

1. Configurar un entorno staging/preview con:

```env
PERFORMANCE_TEST_TOKEN=<token-seguro>
OPENAI_SIMULATION_MODE=true
```

2. Ejecutar inventario:

```powershell
npm.cmd run perf:inventory
```

3. Ejecutar carga simulada:

```powershell
npm.cmd run perf:load -- --base-url https://preview-autorizado.vercel.app --token <token-seguro> --vus 25 --duration 300 --scenario nivel-1 --out reports/performance/nivel-1.json
```

4. Revisar `reports/performance/*.json`.

No ejecutar contra producción sin autorización explícita.

## Reversión

Punto de recuperación:

```powershell
git checkout backup/sprint22-performance-start-20260924-085556
```

Reversión selectiva:

- retirar `src/lib/performance/`;
- retirar `src/app/api/performance/simulate/route.ts`;
- restaurar `src/lib/ai/openai.ts`;
- retirar `scripts/performance-load.mjs`;
- retirar `scripts/performance-inventory.mjs`;
- retirar `performance/sprint22-scenarios.json`;
- retirar `docs/performance/sprint22-endpoints.json`;
- retirar `reports/performance/sprint22-local-smoke.json`;
- retirar pruebas y documentación de Sprint 22.
