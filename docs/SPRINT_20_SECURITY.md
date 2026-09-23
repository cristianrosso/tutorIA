# Sprint 20 — Seguridad, control de acceso y protección de datos

## Estado inicial auditado

Rama de partida: `main`.

Commit de partida: `16744d0 Add student analytics coverage endpoint`.

Antes de modificar código se creó un punto de recuperación local:

- rama: `backup/sprint20-security-start-20260923-103745`

No se usaron comandos destructivos. No se ejecutaron migraciones destructivas. No se desplegó producción durante este sprint.

## Alcance implementado

Sprint 20 endurece la superficie conectada actual de Tutor IA FATESCIPOL sin reemplazar la arquitectura de Next.js, Supabase, Vercel ni OpenAI.

El trabajo se concentró en controles aplicables de inmediato:

- cabeceras HTTP de seguridad desde `next.config.ts`;
- bloqueo de caché en rutas privadas y APIs;
- validación centralizada de filtros de analítica;
- respuestas de error genéricas para endpoints sensibles;
- rate limiting persistente en endpoints de analítica de estudiante y administrador;
- reducción de confianza en parámetros enviados desde el navegador;
- validación del listado administrativo de estudiantes;
- pruebas automáticas de los nuevos controles.

## Controles de cabeceras

Se configuraron cabeceras globales para toda la aplicación:

- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `X-DNS-Prefetch-Control: on`;
- `Strict-Transport-Security` con `includeSubDomains` y `preload`;
- `Permissions-Policy` restringiendo cámara, geolocalización y browsing topics, y permitiendo micrófono solo al propio origen;
- `Content-Security-Policy` con origen propio, bloqueo de `object-src`, bloqueo de `frame-ancestors` y conexión limitada a Supabase y al propio origen.

También se aplicó `Cache-Control: no-store` en:

- `/api/:path*`;
- `/admin/:path*`;
- `/analitica`;
- `/progreso`;
- `/tutor` y `/tutor/:path*`;
- `/simulacro`;
- `/practica`;
- `/clase`;
- `/plan-estudio`;
- `/recomendaciones`.

## Validación de entradas

Se agregó `src/lib/security/request-guards.ts` para centralizar validaciones reutilizables.

La primera aplicación cubre los filtros de analítica:

- `period` solo acepta `7d`, `30d`, `40d` o `all`;
- `unitId` y `topicId` solo aceptan UUID válidos;
- entradas manipuladas devuelven error 400;
- errores internos devuelven mensajes genéricos.

Los endpoints de analítica de estudiante no aceptan `user_id` del navegador. El usuario se obtiene desde la sesión validada con `requireStudent()`.

## Endpoints reforzados

Endpoints de estudiante:

- `GET /api/student/analytics`;
- `GET /api/student/analytics/assessments`;
- `GET /api/student/analytics/coverage`;
- `GET /api/student/analytics/export`;
- `GET /api/student/analytics/reinforcement`;
- `GET /api/student/analytics/simulations`.

Endpoints de administrador:

- `GET /api/admin/analytics`;
- `GET /api/admin/analytics/assessments`;
- `GET /api/admin/analytics/simulations`;
- `GET /api/admin/analytics/units`;
- `GET /api/admin/students`.

Los endpoints de analítica aplican rate limiting persistente con llaves separadas por perfil y tipo de operación. La exportación CSV tiene un límite más estricto que las consultas de lectura.

## Control administrativo de estudiantes

`GET /api/admin/students` valida ahora sus parámetros con Zod:

- `q`: texto corto de búsqueda;
- `status`: `all`, `active`, `pending`, `expired` o `suspended`;
- `page`: entero entre 1 y 200.

El endpoint exige rol administrador antes de consultar datos.

## Auditoría de secretos y cliente privilegiado

La configuración mantiene las claves sensibles sin prefijo `NEXT_PUBLIC_`.

Variables críticas:

- `SUPABASE_SECRET_KEY`;
- `OPENAI_API_KEY`.

Estas claves se leen desde módulos de servidor. El cliente privilegiado de Supabase permanece centralizado en `src/lib/supabase/admin.ts`, marcado con `server-only`.

## Pruebas agregadas

Se agregó `tests/security-sprint20.test.ts` para verificar:

- aceptación de filtros válidos;
- rechazo de IDs manipulados;
- rechazo de periodos desconocidos;
- presencia de cabeceras de seguridad;
- no-cache para APIs.

## Validación ejecutada

Comandos ejecutados:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run lint
npm.cmd audit --audit-level=high
npm.cmd run build
```

Resultado:

- TypeScript pasó.
- Vitest pasó con 107 pruebas.
- ESLint pasó.
- `npm audit --audit-level=high` no reportó vulnerabilidades.
- `next build` pasó.

## Limitaciones conocidas

La política CSP conserva `script-src 'unsafe-inline' 'unsafe-eval'` y `style-src 'unsafe-inline'` por compatibilidad con la aplicación Next.js existente. El siguiente endurecimiento debe probar una política más estricta en staging antes de aplicarla a producción.

Este sprint no modifica RLS ni migraciones de base de datos. La auditoría de RLS completa debe hacerse con el SQL real aplicado en Supabase antes de declarar cierre total del módulo de seguridad.

No se implementó bloqueo automático por presupuesto ni suspensión automática por alertas. Esos controles siguen perteneciendo al módulo económico y administrativo.

No se desplegó producción desde este sprint. El despliegue debe hacerse solo con autorización explícita posterior y después de revisar que las cabeceras no bloquean recursos legítimos en Vercel.

## Reversión

Si hubiera que revertir este sprint, usar la rama de recuperación local:

```powershell
git checkout backup/sprint20-security-start-20260923-103745
```

Para una reversión selectiva, retirar:

- `src/lib/security/request-guards.ts`;
- `tests/security-sprint20.test.ts`;
- cambios de cabeceras en `next.config.ts`;
- validación/rate-limit agregados en endpoints de analítica y estudiantes;
- esta documentación y la sección Sprint 20 del README.
