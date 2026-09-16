# Informe Sprint 3 - 15 de septiembre de 2026

## Estado

Sprint 3 implementa tutor conversacional por voz sobre el mismo RAG textual de Sprint 2. No se reconstruyo el RAG, no se cargaron nuevas unidades, no se implemento simulacro completo, tribunal IA, calificaciones, analitica avanzada ni gamificacion.

## Arquitectura de voz utilizada

Flujo implementado:

1. El estudiante graba audio desde `/tutor` con `MediaRecorder`.
2. El navegador envia el archivo de audio al backend seguro.
3. `/api/tutor/voice/respond` transcribe con OpenAI STT.
4. La transcripcion entra a `answerTutorQuestion`, alias del mismo `answerQuestion` usado por el tutor textual.
5. El tutor reutiliza el mismo RAG, mismas fuentes y mismo prompt pedagogico.
6. `/api/tutor/voice/speech` convierte la respuesta a audio con OpenAI TTS.
7. La interfaz reproduce el audio, permite detenerlo y conserva fuentes en pantalla.

## Archivos modificados o creados

- `src/components/tutor-form.tsx`: interfaz texto/voz, estados, grabacion, cancelacion, reproduccion y cache de audio.
- `src/app/api/tutor/voice/respond/route.ts`: endpoint seguro para audio -> STT -> RAG -> tutor.
- `src/app/api/tutor/voice/speech/route.ts`: endpoint seguro para respuesta -> TTS.
- `src/lib/ai/openai.ts`: funciones OpenAI para Responses API, transcripcion y sintesis de voz.
- `src/lib/ai/costs.ts`: estimaciones de costo y duracion hablada.
- `src/lib/rag/tutor.ts`: soporte de conversacion, intenciones y modo voz sin duplicar el tutor.
- `src/app/globals.css`: estilos mobile-first del panel de voz.
- `tests/rag.test.ts`: pruebas de contexto conversacional e intenciones.
- `tests/e2e/auth/voice.spec.ts`: prueba Playwright mobile/desktop de la UI de voz autenticada.
- `.env.example`: variables opcionales para STT, TTS, voz y costos.
- `AGENTS.md` y `CLAUDE.md`: archivos generados automaticamente por Next dev.

## Endpoints creados

- `POST /api/tutor/voice/respond`
  - Recibe `audio`, `duration` y `conversationId` opcional.
  - Devuelve transcripcion, respuesta, fuentes, modelos y uso basico.

- `POST /api/tutor/voice/speech`
  - Recibe `conversationId` y `text`.
  - Devuelve audio `mp3` y cabeceras con modelo y duracion estimada.

## Modelos

- STT: `gpt-4o-mini-transcribe` por defecto, configurable con `OPENAI_STT_MODEL`.
- Tutor: `gpt-4.1-mini` por defecto, configurable con `OPENAI_MODEL`.
- TTS: `gpt-4o-mini-tts` por defecto, configurable con `OPENAI_TTS_MODEL`.
- Voz TTS: `alloy` por defecto, configurable con `OPENAI_TTS_VOICE`.

## Control de costos

- El microfono se detiene al finalizar la grabacion.
- Se rechaza audio vacio o muy corto.
- Se limita cada intervencion a 75 segundos.
- El tutor de voz usa limite de salida menor que texto.
- La UI cachea el audio por respuesta para no regenerar TTS si el estudiante vuelve a escuchar la misma respuesta.
- El contexto conversacional se resume con pocos mensajes recientes.
- El registro de uso separa eventos `stt`, `chat` y `tts` para evitar doble conteo de segundos.

## Registro de uso

Se registra en `usage_events`:

- `user_id`
- `session_id` como conversation_id
- `event_type`: `stt`, `chat` o `tts`
- `audio_input`
- `audio_output`
- `input_tokens`
- `output_tokens`
- `model`
- `created_at`
- `estimated_cost`

## Resultados medidos

Conversacion principal exitosa de 4 turnos:

- Latencias de respuesta RAG/tutor: 20.91s, 17.34s, 18.48s, 20.57s.
- Latencia promedio aproximada: 19.3s.
- Duracion de respuestas habladas: 58s, 59s, 58s, 55s.
- Duracion promedio aproximada: 57.5s.
- Tokens entrada registrados: 10.541.
- Tokens salida registrados: 771.
- Audio entrada registrado: 22s.
- Audio salida registrado: 230s.
- Costo estimado app: USD 0.063094.

Prueba de contenido exitosa de 3 preguntas:

- Latencias: 19.60s, 18.62s, 18.45s.
- Latencia promedio aproximada: 18.9s.
- Duracion de respuestas habladas: 56s, 55s, 54s.
- Duracion promedio aproximada: 55.0s.
- Tokens entrada registrados: 7.771.
- Tokens salida registrados: 598.
- Audio entrada registrado: 20s.
- Audio salida registrado: 165s.
- Costo estimado app: USD 0.045513.

Total de validacion exitosa reportada:

- 7 turnos de voz.
- Tokens entrada: 18.312.
- Tokens salida: 1.369.
- Audio entrada: 42s.
- Audio salida: 395s.
- Costo estimado app: USD 0.108607.

Durante el ajuste de duracion hubo dos corridas adicionales de calibracion con respuestas largas; su costo estimado registrado fue USD 0.181649. El costo total de todas las corridas de voz registradas durante el sprint fue aproximadamente USD 0.290256. Estos valores usan las variables configurables de estimacion local y deben revisarse contra la pagina oficial de precios si cambian las tarifas.

## Conversaciones de prueba

Conversacion principal:

1. Estudiante: "¿Qué es la doctrina policial?"
   - Resultado: transcripcion correcta, 5 fuentes recuperadas del compendio, respuesta pedagogica hablada de 58s.
2. Estudiante: "Explícamelo más fácil."
   - Resultado: mantiene `conversationId`, reformula con lenguaje mas simple, 5 fuentes recuperadas, 59s.
3. Estudiante: "Dame un ejemplo."
   - Resultado: reconoce intencion de ejemplo, conserva contexto de doctrina policial, 5 fuentes recuperadas, 58s.
4. Estudiante: "¿Y cómo respondería eso en mi examen?"
   - Resultado: reconoce intencion de examen oral y genera respuesta modelo, 5 fuentes recuperadas, 55s.

Prueba de contenido:

- "¿Cuáles son los principios institucionales?" recupero 5 fuentes del compendio.
- "Explícame qué significa disciplina." recupero 5 fuentes del compendio.
- "¿Qué significa que la Policía sea jerarquizada?" recupero 5 fuentes del compendio.

## Android / movil

Se verifico UI mobile vertical con Playwright en viewport 390x844 y proyecto movil Chromium. Los botones de microfono, cancelar, escuchar y detener voz son visibles y no generan scroll horizontal.

No se verifico en un dispositivo Android fisico conectado. Para Android Chrome real, el microfono puede requerir origen seguro. Por eso la UI muestra un mensaje especifico si se intenta grabar desde una direccion no segura. Para pruebas reales desde telefono se recomienda usar HTTPS, un tunel seguro o un despliegue con certificado.

## Errores pendientes

- La reproduccion hablada empieza despues de generar el MP3 completo; aun no hay streaming real de TTS.
- Android fisico queda pendiente hasta disponer de origen HTTPS o tunel seguro.
- Las estimaciones de costo dependen de variables configurables y deben actualizarse si cambian las tarifas oficiales.

## Validacion final

- `npm.cmd run format:check`: correcto.
- `npm.cmd run lint`: correcto.
- `npm.cmd run typecheck`: correcto.
- `npm.cmd test`: 5 archivos, 51 pruebas correctas.
- `npm.cmd run build`: correcto; incluye `/api/tutor/voice/respond` y `/api/tutor/voice/speech`.
- `npm.cmd run test:e2e`: 6 pruebas correctas.
- `npm.cmd run test:e2e:auth`: 8 pruebas correctas, incluida UI de voz mobile/desktop.
