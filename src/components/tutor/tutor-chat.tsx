"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Bot,
  Loader2,
  Send,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

type Source = {
  unitNumber: number | null;
  unitName: string | null;
  topicName: string | null;
  sectionName: string | null;
  reference: string | null;
  score: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  usage?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
  suggestedFollowUps?: string[];
};

type TutorMode =
  | "normal"
  | "quick"
  | "explain"
  | "simple"
  | "academic"
  | "deep"
  | "example"
  | "review"
  | "comparison"
  | "step_by_step";

type TutorChatResponse = {
  conversationId: string;
  messageId: string;
  answer: string;
  intent: string;
  mode: TutorMode;
  strategy: string;
  sources: Source[];
  suggestedFollowUps: string[];
  usage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
  error?: string;
};

const modeOptions: Array<{ value: TutorMode; label: string; help: string }> = [
  { value: "normal", label: "Normal", help: "Respuesta equilibrada." },
  { value: "quick", label: "Rápido", help: "Breve y directo." },
  {
    value: "simple",
    label: "Sencillo",
    help: "Lenguaje fácil sin perder el concepto.",
  },
  {
    value: "academic",
    label: "Académico",
    help: "Formal, con elementos y aplicación.",
  },
  { value: "deep", label: "Profundo", help: "Mayor desarrollo y relaciones." },
  {
    value: "example",
    label: "Ejemplo",
    help: "Ejemplo didáctico contextualizado.",
  },
  { value: "review", label: "Repaso", help: "Preparación para examen." },
  {
    value: "comparison",
    label: "Comparación",
    help: "Semejanzas y diferencias.",
  },
  {
    value: "step_by_step",
    label: "Paso a paso",
    help: "Procesos, fases o procedimientos.",
  },
];

export function TutorChat({
  unit,
  initialConversationId,
  initialMessages,
}: {
  unit: { number: number; name: string };
  initialConversationId?: string;
  initialMessages?: ChatMessage[];
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(
    initialConversationId || "",
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages || [],
  );
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<TutorMode>("normal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const localMessageIdRef = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  async function submit(text = message, overrideMode?: TutorMode) {
    const clean = text.trim();
    if (clean.length < 3 || pending) return;
    setError(null);
    setPending(true);
    setMessage("");
    localMessageIdRef.current += 1;
    const localUser: ChatMessage = {
      id: `local-${localMessageIdRef.current}`,
      role: "user",
      content: clean,
    };
    setMessages((current) => [...current, localUser]);
    try {
      const response = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId || undefined,
          message: clean,
          mode: overrideMode || mode,
          unitNumber: unit.number,
        }),
      });
      const payload = (await response.json()) as TutorChatResponse;
      if (!response.ok)
        throw new Error(payload.error || "No se pudo consultar el tutor.");
      setConversationId(payload.conversationId);
      setMessages((current) => [
        ...current,
        {
          id: payload.messageId,
          role: "assistant",
          content: payload.answer,
          sources: payload.sources,
          usage: payload.usage,
          suggestedFollowUps: payload.suggestedFollowUps,
        },
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No pude completar la consulta en este momento.",
      );
    } finally {
      setPending(false);
    }
  }

  function newConversation() {
    setConversationId("");
    setMessages([]);
    setMessage("");
    setError(null);
  }

  return (
    <section className="chat-panel panel">
      <div className="section-heading">
        <div>
          <h2>Chat pedagógico</h2>
          <span>
            Unidad {unit.number} · {unit.name}
          </span>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={newConversation}
        >
          Nueva conversación
        </button>
      </div>

      <div className="mode-selector" aria-label="Modo pedagógico del tutor">
        <label htmlFor="pedagogical-mode">Modo de explicación</label>
        <select
          id="pedagogical-mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as TutorMode)}
        >
          {modeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span>{modeOptions.find((option) => option.value === mode)?.help}</span>
      </div>

      <div className="mode-row" aria-label="Accesos rápidos de modo">
        {modeOptions.slice(1).map((option) => (
          <button
            className={`mode-pill ${mode === option.value ? "active" : ""}`}
            key={option.value}
            type="button"
            onClick={() => setMode(option.value)}
            title={option.help}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="chat-thread" aria-live="polite">
        {messages.length === 0 && (
          <div className="chat-empty">
            <Bot size={26} />
            <h3>Pregunta como hablarías con un profesor.</h3>
            <p>
              El tutor usará el motor RAG académico MKF-1, conservará contexto y
              mostrará fuentes del compendio.
            </p>
          </div>
        )}
        {messages.map((item) => (
          <article className={`chat-bubble ${item.role}`} key={item.id}>
            <strong>{item.role === "user" ? "Tú" : "Tutor IA"}</strong>
            <div className="answer-text">{item.content}</div>
            {item.role === "assistant" && (
              <>
                <SourceSummary sources={item.sources || []} />
                <div className="message-actions">
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => void sendFeedback(item.id, "up")}
                    aria-label="Respuesta útil"
                  >
                    <ThumbsUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => void sendFeedback(item.id, "down")}
                    aria-label="Respuesta no útil"
                  >
                    <ThumbsDown size={16} />
                  </button>
                  {item.usage && (
                    <small>
                      {item.usage.model} ·{" "}
                      {item.usage.inputTokens + item.usage.outputTokens} tokens
                    </small>
                  )}
                </div>
                {item.suggestedFollowUps?.length ? (
                  <div className="follow-up-row">
                    {item.suggestedFollowUps.map((followUp) => (
                      <button
                        className="button secondary"
                        type="button"
                        key={followUp}
                        onClick={() =>
                          void submit(followUp, modeForFollowUp(followUp))
                        }
                      >
                        {followUp}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="follow-up-row">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => router.push(`/practica?unit=${unit.number}`)}
                  >
                    Practicar este tema
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
        {pending && (
          <div className="chat-thinking">
            <Loader2 className="spin-icon" size={18} /> Tutor está pensando…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="notice error">{error}</p>}

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={3}
          maxLength={1200}
          placeholder="Ej. ¿Qué es archivística?"
        />
        <button
          className="button primary"
          disabled={pending || message.trim().length < 3}
        >
          <Send size={17} /> Enviar
        </button>
      </form>
    </section>
  );
}

async function sendFeedback(messageId: string, rating: "up" | "down") {
  await fetch("/api/tutor/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId, rating }),
  }).catch(() => null);
}

function SourceSummary({ sources }: { sources: Source[] }) {
  return (
    <div className="chat-sources">
      <strong>
        <BookOpen size={16} /> Fuente
      </strong>
      {sources.length ? (
        sources.slice(0, 3).map((source, index) => (
          <p key={`${source.reference}-${index}`}>
            Compendio FATESCIPOL 2026 ·{" "}
            {source.unitNumber ? `Unidad ${source.unitNumber}` : "Unidad"}
            {source.unitName ? ` - ${source.unitName}` : ""}
            {source.topicName ? ` · ${source.topicName}` : ""}
            {source.sectionName ? ` · ${source.sectionName}` : ""}
          </p>
        ))
      ) : (
        <p>No se recuperó una fuente suficiente del compendio.</p>
      )}
    </div>
  );
}

function modeForFollowUp(text: string): TutorMode | undefined {
  if (/f[aá]cil|claro|no entend/i.test(text)) return "simple";
  if (/ejemplo|caso/i.test(text)) return "example";
  if (/profundiza|m[aá]s/i.test(text)) return "deep";
  if (/tabla|compar/i.test(text)) return "comparison";
  if (/paso|secuencia|ord[eé]name/i.test(text)) return "step_by_step";
  if (/preg[uú]ntame|examen|respuesta modelo|repaso/i.test(text))
    return "review";
  return undefined;
}
