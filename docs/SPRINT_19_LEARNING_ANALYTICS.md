# Sprint 19 — Analítica académica y seguimiento del aprendizaje

## Estado inicial auditado

Rama de partida: `main`.

Commit de partida: `bb97c3a Avoid nested schema dependency in knowledge admin`.

Últimos commits relevantes antes de iniciar:

- `bb97c3a` Sprint 18: ajuste de administración de conocimiento.
- `0ef085e` Sprint 18: gestión avanzada de conocimiento.
- `c958553` limitación de cuentas a un dispositivo.
- `396e043` Sprint 17: panel administrativo y optimizaciones de voz/costo.

## Reversión selectiva del sprint offline

Se detectaron cambios sin confirmar atribuibles exclusivamente al sprint Android offline:

- `android-offline/`
- `offline-package/`
- `docs/SPRINT_19_OFFLINE_ANDROID.md`
- `scripts/offline-keygen.mjs`
- `scripts/offline-package-export.mjs`
- `scripts/offline-license-create.mjs`
- scripts `offline:*` agregados a `package.json`
- sección Sprint 19 offline agregada al `README.md`

Se creó punto de recuperación local antes de revertir:

- rama: `backup/sprint19-offline-recovery-20260923-095825`
- commit: `2868e7d Backup Sprint 19 offline proposal before selective revert`

La reversión se realizó cambiando de vuelta a `main`, donde esos cambios no estaban confirmados, y retirando la cadena vacía `android-offline/` que quedó sin archivos versionados. No se usó `git reset --hard` ni `git clean -fd`.

## Archivos revertidos

Los cambios offline quedaron fuera de `main`:

- módulo Android nativo;
- contrato de paquete offline;
- scripts de llaves, paquetes y licencias offline;
- documentación Android offline;
- comandos `offline:*` del `package.json`;
- sección offline del `README.md`.

## Archivos conservados

Se conservaron íntegramente los avances previos conectados a Internet:

- Next.js;
- Vercel;
- Supabase;
- OpenAI;
- RAG;
- MKF-1;
- tutor conversacional;
- tutor por voz;
- memoria académica;
- evaluación formativa;
- simulador;
- aprendizaje adaptativo;
- plan de estudio;
- modo clase;
- panel administrativo;
- gestión avanzada de conocimiento.

## Migraciones identificadas

No se encontraron migraciones SQL creadas por el sprint offline. No se aplicó ningún rollback de base de datos. No se ejecutó ninguna migración destructiva.

## Arquitectura de analítica implementada

Se implementó una capa de agregación determinista en:

- `src/lib/analytics/learning-analytics.ts`

La capa reutiliza tablas existentes:

- `student_learning_events`
- `student_topic_progress`
- `student_learning_evidence`
- `assessment_sessions`
- `exam_sessions`
- `guided_class_sessions`
- `student_study_activities`
- `academic_units`
- `profiles`

No crea una segunda memoria académica. No llama a OpenAI para calcular indicadores.

## Indicadores implementados

### Estudiante

Ruta:

- `/analitica`

Endpoints:

- `GET /api/student/analytics`
- `GET /api/student/analytics/assessments`
- `GET /api/student/analytics/simulations`
- `GET /api/student/analytics/coverage`
- `GET /api/student/analytics/reinforcement`
- `GET /api/student/analytics/export`

Indicadores:

- eventos académicos;
- días con actividad;
- tutor/interacciones registradas;
- clases iniciadas y completadas;
- cobertura por unidad;
- temas trabajados;
- evaluaciones completadas;
- precisión observada de evaluaciones;
- simulacros completados;
- precisión observada de simulacros;
- cumplimiento del plan;
- temas para refuerzo.

### Administrador

Ruta:

- `/admin/analytics`

Endpoints:

- `GET /api/admin/analytics`
- `GET /api/admin/analytics/units`
- `GET /api/admin/analytics/assessments`
- `GET /api/admin/analytics/simulations`

Indicadores agregados:

- estudiantes con actividad;
- eventos académicos del periodo;
- evaluaciones completadas;
- simulacros completados;
- clases completadas;
- actividades del plan completadas;
- unidades con más actividad;
- tipos de evento registrados;
- refuerzo agregado por unidad.

## Reglas de cálculo

- Actividad no equivale a dominio académico.
- Cobertura no equivale a rendimiento.
- Rendimiento observado solo se calcula con evaluaciones o simulacros con puntaje y denominador válido.
- Si no hay datos suficientes, se muestra `Sin datos suficientes` o `null` en API.
- Los temas de refuerzo se derivan de errores registrados, estado `review_needed` y resultados observados.
- No se generan rankings públicos ni se exponen conversaciones privadas.

## Permisos y privacidad

Los endpoints de estudiante usan `requireStudent`, por lo que consultan únicamente el usuario autenticado.

Los endpoints administrativos usan `requireAdmin` y entregan agregados. La página administrativa no muestra conversaciones privadas ni transcripciones completas.

La seguridad de tablas existentes se mantiene mediante las políticas RLS ya definidas en migraciones anteriores. La capa usa consultas de servidor con service role solo para agregación interna autorizada por rol.

## Rendimiento

La implementación usa consultas limitadas por periodo y `limit` conservador:

- eventos: hasta 5000 en administración;
- progreso: hasta 5000;
- evaluaciones: hasta 3000;
- simulacros: hasta 1500;
- actividades de plan: hasta 3000.

El periodo por defecto es 40 días, coherente con el servicio operativo actual. Se admiten 7 días, 30 días, 40 días y todo el historial.

## Pruebas ejecutadas

Reversión offline:

- `npm.cmd run typecheck` — correcto.
- `npm.cmd run lint` — correcto.
- `npm.cmd test` — 99 pruebas pasaron antes de Sprint 19.

Sprint 19 analítica:

- `npm.cmd run typecheck` — correcto.
- `npm.cmd test` — 103 pruebas pasaron.
- `npm.cmd run lint` — correcto.
- `npm.cmd run build` — correcto. Build generó rutas `/analitica`, `/admin/analytics` y endpoints de analítica.

Pruebas unitarias nuevas:

- `tests/learning-analytics-sprint19.test.ts`

Validan:

- porcentaje con denominador válido;
- ausencia de rendimiento observado cuando no hay datos;
- estados: sin evidencia, estudiado, practicado, evaluado y requiere refuerzo;
- periodo operativo de 40 días.

## Limitaciones conocidas

- No se ejecutaron pruebas remotas contra Supabase producción desde esta entrega.
- No se ejecutaron pruebas e2e visuales de navegador.
- Las métricas dependen de que los sprints anteriores registren eventos correctamente.
- Las agregaciones administrativas son suficientes para 400 estudiantes previstos, pero no sustituyen pruebas de carga formales.
- El CSV inicial del estudiante es resumen; no exporta conversaciones ni datos personales innecesarios.

## Estado final

La arquitectura conectada se mantiene: Next.js + Vercel + Supabase + OpenAI.

No se desplegó a producción en esta entrega.

No se ejecutaron migraciones destructivas.

No se inició Sprint 20.
