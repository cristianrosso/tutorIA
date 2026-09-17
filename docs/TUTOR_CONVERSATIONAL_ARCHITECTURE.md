# Sprint 5C · Arquitectura del Tutor Conversacional

El Tutor Conversacional Pedagógico usa el motor RAG académico MKF-1 creado en Sprint 5B mediante `retrieveAcademicContext(query, options)`.

## Flujo

1. El estudiante envía una pregunta desde `/tutor`.
2. `POST /api/tutor/chat` valida sesión, longitud, modo y acceso de estudiante.
3. `generateTutorResponse()` obtiene o crea una conversación.
4. `conversation-context.ts` recupera solo mensajes recientes y relevantes.
5. `retrieveAcademicContext()` recupera fuentes académicas MKF-1.
6. `model-router.ts` selecciona Luna o Terra según intención, modo y complejidad.
7. OpenAI genera una respuesta pedagógica con el prompt maestro.
8. `response-validator.ts` evita responder sin fuentes suficientes.
9. Se guardan conversación, mensajes, fuentes, tokens, modelo y costo estimado.
10. La UI muestra respuesta, fuentes, sugerencias y feedback.

## Modos

- `normal`: equilibrio entre precisión y claridad.
- `quick`: respuesta breve de repaso.
- `explain`: explicación paso a paso.
- `example`: prioriza ejemplo didáctico.
- `review`: respuesta orientada a examen oral.

## Seguridad pedagógica

El prompt maestro prohíbe inventar normas, artículos, fechas, sanciones, procedimientos o atribuciones. El contexto recuperado se trata como datos académicos y no como instrucciones. Los pedidos de prompt injection se rechazan.

## Persistencia

Tablas nuevas:

- `tutor_conversations`
- `tutor_messages`
- `tutor_message_sources`
- `tutor_message_feedback`

RLS permite lectura al propietario activo y administradores. Las escrituras se realizan desde servidor con `service_role` después de validar sesión.

## Fuentes

La respuesta muestra fuentes de forma sencilla: Compendio FATESCIPOL 2026, unidad y tema. No se exponen IDs internos al estudiante.

## Costos

Se registran `model_used`, `input_tokens`, `output_tokens` y `estimated_cost`. El router inicial usa:

- `OPENAI_FAST_MODEL` para definiciones, enumeraciones, ejemplos simples y seguimiento.
- `OPENAI_MODEL` para explicación profunda, comparación, razonamiento pedagógico y modo repaso.

## Limitación actual

El endpoint devuelve JSON completo. La interfaz muestra “Tutor está pensando”. Streaming token a token queda preparado para un sprint posterior si se decide priorizarlo.
