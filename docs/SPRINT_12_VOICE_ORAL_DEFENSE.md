# Sprint 12 — Tutor IA por voz y simulador de defensa oral

## Arquitectura implementada

La voz funciona por turnos. El navegador captura audio con `MediaRecorder`, el backend valida el archivo, OpenAI transcribe el audio, el estudiante revisa la transcripción y recién entonces se envía al tutor académico existente. La respuesta vuelve por el mismo motor conversacional/RAG y se convierte a audio bajo demanda mediante TTS.

## Tutor conversacional

- `POST /api/tutor/voice/transcribe`: recibe audio, valida tamaño/duración/formato y devuelve transcripción editable.
- `POST /api/tutor/voice/text`: envía la transcripción confirmada a `generateTutorResponse`.
- `POST /api/tutor/voice/speech`: convierte la respuesta del tutor a audio reproducible.

## Simulador de defensa oral

El simulador usa preguntas abiertas de tribunal. Cada pregunta puede escucharse por TTS, responderse por micrófono o por texto, corregir la transcripción y guardarse. La evaluación final sigue usando el motor de evaluación del Sprint 7/Sprint 8.

- `POST /api/exams/[id]/voice/transcribe`: transcribe respuestas orales de un simulacro activo.
- `POST /api/exams/[id]/voice/speech`: reproduce preguntas y retroalimentación.
- `POST /api/exams/[id]/answer`: conserva `inputMode`, `transcriptRaw` y `transcriptEdited` dentro de la respuesta guardada.

## Configuración

Variables opcionales:

- `OPENAI_STT_MODEL` por defecto `gpt-4o-mini-transcribe`.
- `OPENAI_TTS_MODEL` por defecto `gpt-4o-mini-tts`.
- `OPENAI_TTS_VOICE` por defecto `alloy`.
- `VOICE_MAX_RECORDING_SECONDS` por defecto `75`.
- `VOICE_MAX_AUDIO_BYTES` por defecto `8388608`.
- `VOICE_MIN_AUDIO_BYTES` por defecto `250`.
- `VOICE_OUTPUT_FORMAT` por defecto `mp3`.

El audio no se almacena de manera permanente; se usa solo para transcripción o reproducción temporal en el navegador.
