# Informe Sprint 1 — 14 de septiembre de 2026

## Estado

Implementación local preparada, compilada y verificada contra Supabase real en Docker. La migración inicial también fue aplicada al proyecto Supabase remoto informado. Se creó un ADMIN permanente y un estudiante inicial, y se comprobó login real remoto desde la app. No se han cargado contenido académico, RAG, voz, OpenAI ni despliegue público. No se comenzó Sprint 2.

## Funcionalidades implementadas

- Next.js 16.3.5, React 19.3.0, TypeScript, Tailwind y diseño responsive institucional.
- Login por username/contraseña con Supabase SSR, cookies, logout y rutas privadas.
- Roles ADMIN/ESTUDIANTE obtenidos del perfil persistido; bloqueo por estado, inicio y expiración.
- Rutas `/login`, `/dashboard`, `/tutor`, `/simulacro` y `/admin`; `/inicio` queda como compatibilidad hacia `/dashboard`.
- Alta inicial de administrador mediante script local, sin contraseñas impresas.
- Alta de estudiantes, activación/desactivación, expiración y restablecimiento de contraseña mediante acciones de servidor protegidas.
- Aula con las tres acciones principales, catálogo de 15 unidades, Doctrina Policial habilitada para el demo y estados explícitos de material pendiente.
- Tutor y simulacro deshabilitados hasta sus sprints; progreso muestra contadores reales sin calificaciones inventadas.
- Dashboard administrativo con cuentas, actividad, tokens, audio, costo estimado y promedio; filtros de ventana temporal y usuario.
- Migración de las 9 tablas exigidas más document_chunks, access_sessions y rate_limit_buckets.
- RLS, permisos mínimos de lectura, restricciones SQL de rúbrica/costos/fechas e índices.
- Rate limiting atómico en PostgreSQL y eventos básicos de servidor sin claves ni contraseñas.
- Configuración exclusivamente de servidor con SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY y SUPABASE_SECRET_KEY. Permite compilar sin credenciales y configurar después al reiniciar.
- Supabase CLI local con Docker en puertos 56430–56439, aislado del resto de proyectos, con migración aplicada automáticamente.

## Archivos creados

La carpeta inicialmente solo contenía `.git`. Todos los archivos de aplicación son nuevos.

| Grupo                  | Archivos                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proyecto               | package.json, package-lock.json, tsconfig.json, next-env.d.ts, next.config.ts, postcss.config.mjs, eslint.config.mjs, .gitignore, .prettierignore                                                                                                                         |
| Configuración          | .env.example; .env.local generado localmente y excluido de Git                                                                                                                                                                                                            |
| Documentación          | README.md, docs/ARCHITECTURE.md, docs/PRD.txt, docs/SPRINT-1.md                                                                                                                                                                                                           |
| Base de datos          | supabase/config.toml, supabase/migrations/202609140001_initial_schema.sql                                                                                                                                                                                                 |
| Administración inicial | scripts/create-admin.mjs, scripts/supabase-local.mjs                                                                                                                                                                                                                      |
| Páginas y estilos      | src/app/layout.tsx, page.tsx, globals.css, loading.tsx, error.tsx, not-found.tsx; login/page.tsx, configuracion/page.tsx, dashboard/page.tsx, tutor/page.tsx, simulacro/page.tsx, inicio/page.tsx, unidades/page.tsx, progreso/page.tsx, admin/page.tsx                   |
| Acciones               | src/app/actions/auth.ts, admin.ts                                                                                                                                                                                                                                         |
| Componentes            | src/components/brand.tsx, login-form.tsx, app-shell.tsx, student-dashboard.tsx, admin-forms.tsx                                                                                                                                                                           |
| Dominio y datos        | src/lib/models.ts, config.ts, data.ts, metrics.ts                                                                                                                                                                                                                         |
| Autenticación          | src/lib/auth/rules.ts, session.ts, rate-limit.ts; src/lib/supabase/server.ts, admin.ts; src/proxy.ts                                                                                                                                                                      |
| Pruebas                | vitest.config.ts, playwright.config.ts, playwright.auth.config.ts, playwright.local.config.ts; tests/rules.test.ts, database.test.ts, actions.test.ts, server-only.ts; tests/e2e/access.spec.ts, auth/session.spec.ts, local/supabase.spec.ts, fixtures/supabase-mock.mjs |

## Pruebas y evidencia

| Validación                              | Resultado                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| npm run build                           | Compilación de producción correcta; rutas evaluadas por solicitud                                                           |
| npm run typecheck                       | Sin errores TypeScript                                                                                                      |
| npm run lint                            | Sin errores ni advertencias de lint                                                                                         |
| npm test                                | 43 pruebas aprobadas                                                                                                        |
| npm run test:e2e                        | 6 pruebas aprobadas: escritorio y móvil sin configuración                                                                   |
| npm run test:e2e:auth                   | 6 pruebas aprobadas: escritorio y móvil con proveedor simulado                                                              |
| npm run test:e2e:local                  | 1 prueba aprobada: Supabase real en Docker, Auth, administración y RLS                                                      |
| npm run format:check                    | Formato correcto                                                                                                            |
| npm audit --omit=dev --audit-level=high | 0 vulnerabilidades reportadas                                                                                               |
| Prueba UI remota                        | ADMIN real entra a /admin; estudiante real entra a /dashboard; /tutor y /simulacro protegidos; estudiante no entra a /admin |
| git check-ignore .env.local             | Confirmado excluido de Git                                                                                                  |
| Revisión visual                         | Capturas de login, aula y administración revisadas; sin desbordamiento horizontal                                           |

Las pruebas SQL ejecutan la migración en PGlite y prueban RLS con roles PostgreSQL y auth.uid simulado. Las pruebas del navegador autenticado ejecutan el SDK Supabase y las acciones Next contra un servidor local de contratos. La prueba `test:e2e:local` usa Supabase real en Docker: crea cuentas efímeras, valida login, alta de estudiante, bloqueo, expiración, reset y aislamiento RLS, y elimina esas cuentas al finalizar.

Las capturas se guardan en `artifacts/login-desktop.png`, `login-mobile.png`, `dashboard-desktop.png`, `dashboard-mobile.png`, `admin-desktop.png` y `admin-mobile.png`. Los dashboards capturados contienen fixtures. `artifacts/` está excluido de Git.

Durante la verificación se corrigieron la generación estática indebida de rutas privadas, la fijación de variables vacías durante build, selectores ambiguos de tests, un adorno superpuesto en la cabecera móvil y la configuración local del proveedor email/password de Supabase.

## Errores pendientes y límites

- Ningún error de compilación o prueba local conocido al cierre de la implementación.
- La aceptación end-to-end real ya pasó en Docker local; en remoto se verificó migración, seed de 15 unidades, bloqueo anónimo por RLS, login ADMIN y login ESTUDIANTE.
- Docker Desktop publicó los puertos del tutor con HostIp amplio aunque se creó una red exclusiva con bind loopback. Se conservan puertos 56430–56439 y no se toca configuración global.
- El límite de sesiones simultáneas está preparado mediante tabla, pero todavía no se aplica. Cambiar contraseña no promete invalidar todos los JWT inmediatamente.
- La API de IA, voz, RAG, simulacro y escritura automática de consumo están fuera de este sprint.
- Falta el compendio; no se ha ingerido Unidad 1.
- No se ha realizado prueba de carga para 300 estudiantes ni despliegue público.

## Siguiente paso recomendado

Probar manualmente el acceso con el ADMIN y el estudiante iniciales. Solo después cerrar Sprint 1 remoto y comenzar la ingestión de Unidad 1 cuando el compendio oficial esté disponible. El contrato pedagogico obligatorio de Sprint 2 queda documentado en `docs/SPRINT-2-PEDAGOGY.md`.
