# Tutor IA FATESCIPOL — arquitectura y plan

## Análisis del PRD y alcance

Aplicación institucional para estudiantes de segundo año de FATESCIPOL El Alto. El compendio 2026 será la única autoridad académica. El demo se limita a Unidad 1, Doctrina Policial; no se conocen los nombres ni contenidos de las otras 14 unidades.

El trabajo actual llega a Sprint 4: Next.js, Supabase, autenticación con username, roles, dashboards, RAG de Unidad 1, tutor textual/voz y simulacro oral con repregunta y rúbrica. No hay cuentas de demostración que omitan la autenticación.

## Estructura propuesta

```text
src/app/                 Páginas, layouts, acciones de servidor
src/components/          Componentes de interfaz
src/lib/auth/            Identidad, validación, autorización
src/lib/supabase/        Clientes de servidor y servicio administrativo
src/lib/                 Modelos, configuración y funciones de dominio
src/proxy.ts             Renovación de cookies de Supabase
supabase/                Configuración CLI, esquema, funciones, RLS y seed de unidades
scripts/                 Supabase local y alta inicial de administrador
tests/                   Pruebas de reglas, SQL y navegador
docs/                    Arquitectura, operación y cierre del sprint
```

Sprint 2 agrega `src/lib/rag/`, `src/lib/ai/` y `src/prompts/tutor-system.ts`. RAG expone ingestDocument(), retrieveContext(), buildTutorContext() y answerQuestion(). Sprint 3 agrega voz STT + RAG + TTS sobre el mismo cerebro academico. Sprint 4 agrega `src/lib/simulations/`, `src/prompts/simulation-system.ts` y acciones/endpoints de simulacro oral.

Sprint 2 tiene un contrato pedagogico obligatorio: el tutor no debe limitarse a recuperar o resumir fragmentos. Debe separar contenido del compendio, explicacion pedagogica generada y ejemplo didactico generado. Puede producir ejemplos y explicaciones solo si son coherentes con el contexto recuperado, y no puede inventar normas, articulos, procedimientos, fechas, competencias, sanciones, atribuciones ni definiciones oficiales.

## Modelo de datos propuesto

| Tabla                | Propósito y relaciones                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------- |
| profiles             | id → auth.users, username único normalizado, nombre, rol, estado, inicio, expiración      |
| units                | Número 1–15 único, nombre, disponibilidad                                                 |
| documents            | Documento, unidad, origen, versión, ruta privada y estado de ingestión                    |
| document_chunks      | Fragmento, documento, unidad, tema, sección, página y metadata; vectores en Sprint RAG    |
| study_sessions       | Propietario, unidad, modalidad, tiempos y estado                                          |
| messages             | Sesión, propietario derivado por RLS, rol, texto y fuentes recuperadas                    |
| simulations          | Propietario, unidad, sesión opcional, estado y tiempos                                    |
| simulation_questions | Simulacro, pregunta, tipo, fuentes, respuesta y orden                                     |
| simulation_results   | Simulacro único, cinco rúbricas limitadas a 30/20/20/20/10, total calculado y feedback    |
| usage_events         | Usuario, sesión/simulacro, proveedor/modelo, tokens, segundos de audio, costo USD y fecha |
| access_sessions      | Base para registrar/revocar sesiones; el límite simultáneo se implementará después        |
| rate_limit_buckets   | Contador atómico persistente para intentos de acceso                                      |

Índices por propietario, fecha y claves foráneas para aproximadamente 300 estudiantes. RLS limita lecturas a datos propios y administradores activos. Ningún cliente puede promover su rol ni escribir consumo o calificaciones. Los writes del motor de IA serán exclusivos del backend. La vigencia se comprueba tanto en servidor como en RLS en cada solicitud; una desactivación no depende de que expire el JWT.

Supabase usa email/password internamente. La aplicación transforma un username validado a una dirección sintética bajo un dominio configurable, sin divulgar un directorio de emails. No se ofrecen envíos de correo a esas direcciones; el restablecimiento inicial es administrativo. Las contraseñas permanecen en Supabase Auth y nunca en profiles.

## Dependencias

- Next.js App Router, React y TypeScript.
- Tailwind CSS para estilos responsive; lucide-react para iconos.
- @supabase/ssr y @supabase/supabase-js para autenticación con cookies y PostgreSQL.
- Zod para validación en servidor.
- Vitest, Playwright, PGlite y Supabase CLI local como herramientas de validación. PGlite prueba SQL con auth simulado; Supabase local en Docker valida Auth/PostgREST/RLS reales.
- OpenAI se usa desde servidor para el tutor textual de Sprint 2. `OPENAI_API_KEY` nunca se expone al navegador.

## Riesgos y decisiones

1. Supabase local ya está automatizado con Docker en puertos 56430–56439. Para aceptación remota faltan clave secreta local, migración del proyecto dedicado y alta inicial de ADMIN.
2. Falta cargar el compendio real: no inventar doctrina, títulos ni resultados. Unidad 1 aparece habilitada y el ADMIN puede cargar texto oficial; si no hay contexto relevante, el tutor se abstiene.
3. Login por username: dominio sintético estable y creación solo por administrador. Desactivar registro público en Supabase; perfiles nuevos no autorizados nunca se activan automáticamente.
4. RLS: funciones SECURITY DEFINER con search_path fijo; tests de aislamiento y de cuentas expiradas. Los permisos del cliente son mínimos.
5. Abuso: limitador persistente por cuenta y límite global para login, además de límites de Supabase Auth. Para producción añadir límites de IP en el proxy confiable/WAF; no confiar en encabezados IP arbitrarios.
6. Costos: no equiparar ausencia de medición con consumo cero. Registrar costo estimado nullable y unidad explícita (USD, segundos). Añadir precios versionados en sprint IA y reconciliación con facturación del proveedor.
7. Voz: permisos de micrófono, HTTPS, latencia, interrupción y compatibilidad móvil se validarán en su sprint.
8. Sesiones simultáneas: tabla de preparación; todavía no se promete limitación efectiva.
9. No se realizará despliegue en Sprint 1. El demo público exige Supabase remoto, material, pruebas de RAG/voz, proveedor y configuración de producción.

## Plan incremental y puertas de verificación

1. **Sprint 1 actual:** inicialización, migración y RLS, login/logout, roles, dashboards y administración básica de accesos. Ejecutar lint, typecheck, tests SQL/dominio, build y pruebas HTTP/navegador. Supabase real local ya cubre Auth/PostgREST/RLS; falta repetir aceptación en el proyecto remoto antes de avanzar.
2. **Sprint 2 actual:** ingestión exclusiva de Unidad 1 y RAG textual trazable con transformación pedagógica. Verificar fragmentación, fuentes, separación entre compendio/explicación/ejemplo y abstención sin contexto.
3. **Sprint 3:** voz textual-avanzada/conversacional, historial continuo y límites de uso más finos. Verificar grounding y costos registrados.
4. **Sprint 4 actual:** simulacro de Unidad 1 con pregunta, repregunta, evaluación por rúbrica, progreso y consumo por estudiante.
5. **Sprint 5:** hardening de voz/simulacro, Android físico con HTTPS, límites finos y revisión de costos.
6. **Sprint 6:** carga para 300 cuentas, pruebas de aceptación y despliegue demo.

## Documentación oficial consultada

- https://nextjs.org/docs/app/guides/authentication
- https://nextjs.org/docs/app/getting-started/proxy
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/database/postgres/row-level-security
