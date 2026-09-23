# Sprint 17 - Panel administrativo y control operativo

Implementación local del panel administrativo integral para Tutor IA FATESCIPOL.

## Rutas del panel

- `/admin`: resumen administrativo existente con navegación interna.
- `/admin/students`: búsqueda, creación y gestión rápida de estudiantes.
- `/admin/students/[id]`: detalle de licencia, consumo, evaluaciones y actividad académica.
- `/admin/licenses`: estado de licencias mensuales, activación, renovación y suspensión.
- `/admin/academics`: seguimiento académico global y temas con refuerzo observado.
- `/admin/usage`: consumo IA y configuración económica.
- `/admin/settings`: configuración económica operativa.
- `/admin/system`: diagnóstico de tablas críticas y errores recientes.
- `/admin/audit`: registro de acciones administrativas.

## Migración requerida en Supabase

Aplicar en el SQL Editor de Supabase:

`supabase/migrations/202609230001_sprint17_admin_dashboard.sql`

La migración crea de forma no destructiva:

- `student_licenses`
- `admin_audit_logs`
- índices operativos
- RLS de lectura para administradores y lectura propia de licencias activas

No modifica pagos históricos ni elimina datos existentes.

## Modelo económico

El Sprint 17 conserva el objetivo operativo:

- licencia configurable, por defecto 30 días;
- presupuesto objetivo Bs 40 por estudiante por mes;
- 400 estudiantes previstos;
- conversión USD/BOB configurable;
- seguimiento de tokens, voz y costo estimado.

## Optimización de costos aplicada

Además del panel, se aplicaron optimizaciones de bajo riesgo porque el consumo diario observado fue de Bs 3.28:

- el router usa el modelo económico `OPENAI_FAST_MODEL` para consultas normales, sencillas, de repaso y explicación no compleja;
- el modelo principal queda reservado para contexto grande, dificultad alta, comparación profunda o procedimientos complejos;
- la síntesis de voz usa caché en tutor, clase, simulacro y exámenes orales;
- repetir el botón escuchar sobre el mismo texto devuelve el audio en caché y no vuelve a llamar al proveedor;
- la lectura por voz vuelve a reproducir el contenido completo en pantalla; si se desea optimizar costo en lecturas largas puede activarse `OPENAI_TTS_LONGFORM_MODEL=tts-1`;\n- `OPENAI_ECONOMY_MODEL` permite probar un modelo de texto más económico sin cambiar el modelo balanceado usado en tareas complejas.

Variables útiles:

```env
VOICE_CACHE_TTL_SECONDS=900
VOICE_CACHE_MAX_ITEMS=80
OPENAI_TTS_LONGFORM_MODEL=tts-1\nVOICE_LONGFORM_CHAR_THRESHOLD=1800\nOPENAI_FAST_MODEL=gpt-5.6-luna\nOPENAI_ECONOMY_MODEL=gpt-5.6-luna
OPENAI_MODEL=gpt-5.6-terra
```

## Validación local

Ejecutado correctamente:

```bash
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

## Despliegue

No se desplegó producción desde este cambio porque el Sprint 17 solicita no desplegar sin autorización explícita.
