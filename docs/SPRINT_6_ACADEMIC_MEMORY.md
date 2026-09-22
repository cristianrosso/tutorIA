# Sprint 6 · Perfil del estudiante y memoria de aprendizaje

## Resumen

Sprint 6 agrega una capa de memoria académica verificable por estudiante. La memoria no reemplaza el RAG ni el compendio: solo registra actividad, progreso y consumo real asociado a operaciones del tutor.

## Modelo de datos

Migración: `supabase/migrations/202609220001_student_academic_memory.sql`.

Tablas nuevas:

- `student_academic_profiles`: perfil académico único por usuario, última unidad/tema y preferencia opcional.
- `student_learning_events`: eventos verificables de estudio, explicación, ejemplo, repaso y práctica.
- `student_topic_progress`: cobertura por objeto/tema, sin asumir dominio por lectura.
- `student_learning_evidence`: evidencia evaluativa formativa preparada para Sprint 7.
- `ai_usage_events`: consumo IA detallado por operación, modelo, tokens y costo estimado.
- `usage_alerts`: alertas administrativas de uso inusual.

Todas las tablas tienen RLS. El estudiante solo lee sus propios datos; el administrador puede consultar lo necesario para gestión.

## Servicios

- `src/lib/learning/academic-memory.ts`
  - `ensureStudentAcademicProfile()`
  - `recordLearningEvent()`
  - `recordSourcesAsLearning()`
  - `getRecentStudiedTopics()`
  - `getTopicsNeedingReview()`
  - `getCurrentLearningContext()`
  - `getStudentLearningSummary()`
  - `getResumeStudySuggestion()`

- `src/lib/learning/memory-context.ts`
  - `buildStudentMemoryContext()` genera contexto breve y verificable para el tutor.

- `src/lib/billing/ai-usage.ts`
  - `calculateOperationCost()`
  - `recordAIUsage()`
  - `getStudentDailyCost()`
  - `getStudentMonthlyCost()`
  - `getStudentPeriodCost()`
  - `getStudentUsageSummary()`

## Integración con el tutor

`src/lib/tutor/tutor-service.ts` ahora:

1. crea/reutiliza el perfil académico;
2. recupera memoria académica breve;
3. usa memoria para continuidad cuando el estudiante dice “continuemos”;
4. mantiene el RAG como fuente oficial;
5. registra actividad académica desde fuentes reales recuperadas;
6. actualiza progreso por tema;
7. registra consumo detallado en `ai_usage_events`.

La memoria se trata como dato del estudiante, no como fuente doctrinal.

## Progreso del estudiante

La ruta `/progreso` ahora muestra:

- cobertura académica;
- rendimiento observado solo cuando hay evidencia evaluativa;
- última actividad;
- memoria de aprendizaje;
- botón “Continuar estudiando”;
- progreso por unidad calculado desde temas reales.

La cobertura no se presenta como dominio.

## Panel administrativo de consumo

Ruta nueva: `/admin/usage`.

Muestra:

- operaciones registradas;
- tokens;
- modelos usados;
- costo acumulado USD/Bs;
- comparación con presupuesto referencial de 80 Bs por estudiante;
- aviso de revisión cuando supera 80% del presupuesto.

## Variables de entorno

```env
STUDENT_PERIOD_PRICE_BOB=200
STUDENT_PERIOD_BUDGET_BOB=80
USD_TO_BOB_ACCOUNTING_RATE=6.96
AI_PRICING_VERSION=2026-09-config
MEMORY_CONTEXT_MAX_TOKENS=420
OPENAI_LUNA_INPUT_COST_PER_1M=0.4
OPENAI_LUNA_OUTPUT_COST_PER_1M=1.6
OPENAI_TERRA_INPUT_COST_PER_1M=2
OPENAI_TERRA_OUTPUT_COST_PER_1M=12
OPENAI_CACHED_INPUT_COST_PER_1M=0
```

## Seguridad

- No se acepta `userId` del cliente como identidad.
- Los datos se obtienen desde sesión autenticada o desde funciones admin.
- Los módulos de datos usan `server-only`.
- RLS protege acceso horizontal.
- Las operaciones de costo se registran desde servidor.

## Limitaciones conocidas

- La evidencia evaluativa abierta queda preparada; Sprint 7 debe registrar resultados de evaluación académica más ricos.
- Las alertas de uso están modeladas, pero el disparo automático avanzado queda para hardening posterior.
- La migración debe aplicarse antes de desplegar esta versión en producción, porque el tutor registra memoria y consumo en tablas nuevas.

## Validación local

- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
