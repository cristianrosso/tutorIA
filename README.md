# Tutor IA FATESCIPOL — Examen de Grado 2026

Aplicación Next.js para estudiantes de Segundo Año de FATESCIPOL El Alto. **Alcance actual: Sprint 4**, tutor textual/voz y simulacro oral sobre Unidad 1. La planificación completa está en [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Lo que funciona en este sprint

- Interfaz responsive en español: login, aula, unidades, progreso y panel administrativo.
- Rutas de Sprint 1: `/login`, `/dashboard`, `/tutor`, `/simulacro` y `/admin`.
- Autenticación por username/password mediante Supabase Auth, cookies de servidor y cierre de sesión.
- Roles ADMIN y ESTUDIANTE consultados desde PostgreSQL; validación de estado, inicio y expiración en servidor y RLS.
- Administración de estudiantes: alta, activación/desactivación, expiración y restablecimiento de contraseña.
- Tablas del PRD, carga de compendio Unidad 1, recuperación RAG textual, consumo y preparación de sesiones.
- Panel con métricas de base de datos y filtros móviles de 24 horas, 7 días y 30 días, y usuario.
- Rate limiting persistente del login y de operaciones administrativas; fallos de conexión cierran el acceso.

El tutor recupera fragmentos cargados del compendio de Unidad 1 y genera una explicación didáctica con fuentes por texto o voz. El simulacro de examen oral ya genera una pregunta inicial, una repregunta y una evaluación con rúbrica sobre Doctrina Policial. Las otras 14 unidades permanecen fuera del demo.

## Instalación local con Docker

Requisitos: Node.js 22 LTS o superior, npm y Docker Desktop. Verificado con Node 24.15.0.

```powershell
npm.cmd ci
npm.cmd run supabase:start
npm.cmd run dev
```

Abre [http://127.0.0.1:3010](http://127.0.0.1:3010). El puerto del tutor es **3010**. Supabase local usa puertos exclusivos **56430–56439** y el script solo opera sobre el proyecto `tutor-ia-fatescipol`; no detiene ni inspecciona procesos de otros proyectos. Docker Desktop puede mostrar esos puertos con HostIp amplio, pero no se cambia configuración global.

`npm.cmd run supabase:start` inicia la instancia local, aplica la migración y escribe `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` en `.env.local` sin imprimirlas. `npm.cmd run supabase:stop` detiene solo este stack y conserva sus volúmenes. No existe una cuenta de prueba que salte la autenticación.

En macOS/Linux utiliza `npm` en lugar de `npm.cmd`. Nunca sobrescribas un `.env.local` ya configurado.

## Supabase remoto

1. Crea un proyecto dedicado desde [Supabase](https://supabase.com/dashboard). No reutilices el proyecto de otra aplicación.
2. En Project Settings / API obtén Project URL y Publishable key. En el apartado de claves de servidor obtén una Secret key (también se admite la clave legacy `service_role`).
3. Configura `.env.local` con `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` y `OPENAI_API_KEY`. Las claves secretas solo se leen desde módulos `server-only`. No llevan prefijo `NEXT_PUBLIC_`.
4. En SQL Editor ejecuta íntegramente `supabase/migrations/202609140001_initial_schema.sql`. Es una migración inicial transaccional para un proyecto vacío; no se debe ejecutar dos veces. Si usas Supabase CLI, vincula el proyecto y aplica la migración mediante `supabase db push`.
5. En Authentication / Providers habilita email/password y **desactiva el registro público de nuevos usuarios**. Las cuentas se crean con la API administrativa, no con signup público. No hay trigger que acepte roles desde metadata de Auth.
6. Configura Site URL como `http://127.0.0.1:3010` para local y usa tu URL HTTPS real al desplegar. No se utilizan enlaces de recuperación por correo en este sprint.
7. Mantén fijo `AUTH_USERNAME_DOMAIN` desde el primer alta. Las direcciones `<username>@usuarios.tutor-fatescipol.invalid` son identificadores técnicos de Auth; no reciben email. El usuario inicia sesión con username.
8. Reinicia el proceso después de cambiar `.env.local`.

El proyecto remoto informado ya puede configurarse desde `.env.local` con sus tres variables de Supabase. La clave secreta `service_role`/Secret key debe quedar solo en ese archivo local; no pegues esa clave ni passwords en el chat.

## Primer administrador

Añade temporalmente a `.env.local`:

```dotenv
BOOTSTRAP_ADMIN_USERNAME=
BOOTSTRAP_ADMIN_NAME=
BOOTSTRAP_ADMIN_PASSWORD=
```

Completa valores reales localmente, con contraseña de 12–128 caracteres, y ejecuta:

```powershell
npm.cmd run admin:create
```

El script se niega a continuar si ya existe un administrador. Crea una cuenta Auth confirmada y su perfil ADMIN activo; si falla el perfil, intenta revertir la cuenta recién creada. Nunca imprime contraseñas ni claves. Elimina después las variables de bootstrap y entra por `/login`.

En `/admin` crea estudiantes con nombre, username, contraseña, fecha de inicio y último día de acceso. Las fechas se interpretan en Bolivia (UTC−4); la expiración se fija a las 23:59:59 del día seleccionado. Entrega credenciales por un canal privado.

La desactivación y la expiración se aplican a las siguientes solicitudes del servidor y de RLS, aunque exista una cookie anterior. El cambio de contraseña modifica Supabase Auth; **todavía no se promete revocación inmediata de todas las sesiones ni limitación de sesiones simultáneas**. Para bloquear inmediatamente una cuenta, desactívala. No cambies el rol ni el estado de administradores desde los formularios de estudiantes; su mantenimiento es operativo desde Supabase.

## Cargar Unidad 1, probar Tutor IA y Simulacro

Entra como ADMIN a `/admin` y usa el bloque **Compendio Unidad 1**. Pega únicamente texto oficial de Unidad 1 - Doctrina Policial. El sistema lo divide en fragmentos y lo deja recuperable por el tutor.

Luego entra como estudiante a `/tutor` y pregunta sobre el contenido cargado. También puedes entrar a `/simulacro` para iniciar una práctica oral de Unidad 1. Si no hay fragmentos relevantes, el tutor se abstiene y no inventa doctrina.

La respuesta separa contenido del compendio, explicación pedagógica y ejemplo didáctico generado cuando corresponda. Los ejemplos generados no se presentan como normas, artículos, procedimientos, fechas, sanciones ni definiciones oficiales.

## Base de datos y permisos

Tablas: `profiles`, `units`, `documents`, `document_chunks`, `study_sessions`, `messages`, `simulations`, `simulation_questions`, `simulation_results`, `usage_events`, `access_sessions`, `rate_limit_buckets`.

Todas tienen RLS habilitado. El navegador no posee permisos de escritura en las tablas; las mutaciones administrativas usan acciones de servidor que verifican ADMIN antes de obtener el cliente privilegiado. Un estudiante puede consultar únicamente su actividad y el material publicado de unidades habilitadas. Un perfil sin vigencia puede leer su propio estado, pero no el material ni la actividad. Usuarios anónimos no pueden leer tablas. Las cuentas de Auth sin perfil no reciben acceso.

El esquema guarda textos y referencias, no archivos binarios. No se crea un bucket público de documentos. El almacenamiento privado y la carga de archivos PDF se agregarán después; Sprint 2 carga texto pegado por ADMIN.

## Consumo y actividad

`usage_events` conserva usuario, modelo, proveedor, tipo, tokens de entrada/salida, audio de entrada/salida **en segundos**, costo estimado **USD**, versión de precios y request ID del proveedor. Un costo `NULL` significa no calculado; el panel lo marca como incompleto. Un request ID único permite deduplicación.

Conversaciones cuenta sesiones de texto/voz. Simulacros cuenta los completados iniciados dentro de la ventana seleccionada. El promedio divide el costo de estudiantes entre todos los estudiantes del filtro, incluidos los que no consumieron; no incorpora el costo de administradores. Los contadores de cuentas muestran el total actual, independientemente del filtro de actividad. La lectura usa paginación explícita para evitar el truncamiento predeterminado de PostgREST.

El costo del panel es una **estimación**, no el costo facturado definitivo. Los eventos de tutor, voz y simulacro registran tokens, segundos de audio y costo estimado. Una tabla de precios versionados y conciliación con facturación real se agregará después.

## Verificación

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd exec playwright install chromium
npm.cmd run test:e2e
npm.cmd run test:e2e:auth
npm.cmd run supabase:start
npm.cmd run test:e2e:local
npm.cmd run format:check
```

- Vitest prueba reglas de acceso, fechas, validación, métricas y acciones de servidor (proveedores mockeados).
- PGlite ejecuta la migración PostgreSQL y las políticas RLS con roles reales de PostgreSQL y `auth.uid()` simulado. Prueba aislamiento, expiración, bloqueo de escritura de roles/costos/notas, acceso anónimo, límite persistente y rúbrica.
- Playwright sin configuración usa build de producción en **3010**: rutas protegidas, estados de configuración, cabeceras, errores JS y diseño móvil/escritorio.
- Playwright de autenticación usa build de producción en **3011** y un servidor de contratos de prueba en **54329**. Recorre login, cookies, roles, logout y dashboards con el SDK real de Supabase contra respuestas simuladas. **No verifica un proyecto Supabase remoto ni su infraestructura Auth/PostgREST.** Los fixtures solo existen en `tests/`; la aplicación no contiene bypass de autenticación.
- Playwright local usa Supabase real en Docker y Next en **56440**. Crea cuentas efímeras, valida login ADMIN/ESTUDIANTE, RLS, bloqueo, expiración y restablecimiento de contraseña; después elimina las cuentas temporales.
- Capturas generadas en `artifacts/` e informes en `test-results/`, excluidos de Git.

Detén únicamente el servidor de este tutor si ocupa 3010 antes de ejecutar `test:e2e`; los tests no reutilizan ni terminan un servidor ajeno. Playwright cierra sus propios procesos al finalizar. No se inspeccionan ni alteran otras aplicaciones.

## Estado actual

Sprint 4 deja listo el demo central: estudiante autenticado, Unidad 1 cargada, tutor con texto/voz, repreguntas con contexto y simulacro oral con evaluación. No se ha realizado un despliegue público; queda para hardening y configuración de producción.

## Referencias

- [SSR con Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Autenticación en Next.js](https://nextjs.org/docs/app/guides/authentication)
- [Proxy en Next.js](https://nextjs.org/docs/app/getting-started/proxy)


## Sprint 5B · Motor RAG académico MKF-1

El motor RAG académico está documentado en [`docs/RAG_ARCHITECTURE.md`](docs/RAG_ARCHITECTURE.md). Incluye embeddings persistidos, búsqueda semántica con pgvector, búsqueda textual, score académico, reranking, expansión parent-child, expansión de relaciones MKF-1 y una pantalla administrativa de diagnóstico en `/admin/knowledge/search`.

Comando de indexación:

```powershell
npm run knowledge:index
```

Variables nuevas opcionales:

```env
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536
RAG_DEBUG=false
```

## Sprint 5C · Tutor conversacional pedagógico

El tutor textual de `/tutor` usa el motor RAG académico MKF-1 mediante `POST /api/tutor/chat`. Guarda conversaciones, mensajes, fuentes, modelo, tokens, costo estimado y feedback del estudiante. La arquitectura está documentada en [`docs/TUTOR_CONVERSATIONAL_ARCHITECTURE.md`](docs/TUTOR_CONVERSATIONAL_ARCHITECTURE.md).

Variables opcionales nuevas:

```env
OPENAI_FAST_MODEL=gpt-5.6-luna
TUTOR_MAX_HISTORY_MESSAGES=8
TUTOR_MAX_HISTORY_TOKENS=900
```
