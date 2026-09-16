"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  ClipboardCheck,
  Loader2,
  Mic,
  Play,
  Send,
  Square,
  Trophy,
  Volume2,
  X,
} from "lucide-react";
import {
  practiceErrors,
  startSimulation,
  submitSimulationAnswer,
  type SimulationActionState,
} from "@/app/actions/simulacro";
import type {
  SimulationQuestion,
  SimulationState,
} from "@/lib/simulations/oral-exam";

export function SimulationPanel({
  initialSimulation,
  unit,
}: {
  initialSimulation: SimulationState | null;
  unit: { number: number; name: string };
}) {
  const [startState, startAction, starting] = useActionState<
    SimulationActionState,
    FormData
  >(startSimulation, { simulation: initialSimulation || undefined });
  const [answerState, answerAction, answering] = useActionState<
    SimulationActionState,
    FormData
  >(submitSimulationAnswer, { simulation: initialSimulation || undefined });
  const [practiceState, practiceAction, practicing] = useActionState<
    SimulationActionState,
    FormData
  >(practiceErrors, {});
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [audioState, setAudioState] = useState<"idle" | "loading" | "playing">(
    "idle",
  );
  const [showModels, setShowModels] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const speechRef = useRef<{ stop: () => void } | null>(null);
  const speechTranscriptRef = useRef("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlsRef = useRef<Map<string, string>>(new Map());

  const simulation = selectVisibleSimulation(
    answerState.simulation,
    startState.simulation,
    initialSimulation,
  );
  const currentQuestion = simulation?.questions.find((q) => !q.answer);

  useEffect(
    () => () => {
      stopTracks();
      stopBrowserSpeech();
      stopAudio();
      for (const url of audioUrlsRef.current.values()) URL.revokeObjectURL(url);
    },
    [],
  );

  useEffect(() => {
    if (!currentQuestion || simulation?.status !== "in_progress") return;
    const timer = window.setTimeout(() => {
      setTranscript("");
      setVoiceError(null);
      void playQuestion(currentQuestion, simulation.id);
    }, 0);
    return () => window.clearTimeout(timer);
    // playQuestion usa refs estables para cachear audio; este efecto debe dispararse solo al cambiar la pregunta activa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id, simulation?.id, simulation?.status]);

  async function playQuestion(
    question: SimulationQuestion,
    simulationId: string,
  ) {
    stopAudio();
    const cached = audioUrlsRef.current.get(question.id);
    if (cached) {
      playUrl(cached);
      return;
    }
    try {
      setAudioState("loading");
      const response = await fetch("/api/simulacro/voice/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          simulationId,
          questionId: question.id,
          text: question.question,
        }),
      });
      if (!response.ok) throw new Error("speech failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      audioUrlsRef.current.set(question.id, url);
      playUrl(url);
    } catch {
      setAudioState("idle");
      setVoiceError(
        "No se pudo reproducir la pregunta. Puedes leerla en pantalla.",
      );
    }
  }

  function playUrl(url: string) {
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setAudioState("idle");
    audio.onerror = () => setAudioState("idle");
    setAudioState("playing");
    void audio.play().catch(() => setAudioState("idle"));
  }

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setAudioState("idle");
  }

  async function startRecording() {
    setVoiceError(null);
    if (!simulation) return;
    if (!window.isSecureContext) {
      setVoiceError(
        "Chrome puede bloquear el micrófono en una dirección no segura. Usa HTTPS o escribe tu respuesta.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      chunksRef.current = [];
      speechTranscriptRef.current = "";
      startBrowserSpeech();
      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stopTracks();
        void transcribe(simulation.id);
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setRecording(true);
      recorder.start(250);
      window.setTimeout(() => stopRecording(), 90_000);
    } catch {
      setVoiceError(
        "No pude acceder al micrófono. Revisa permisos del navegador.",
      );
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.requestData();
      recorderRef.current.stop();
    }
    stopBrowserSpeech();
    setRecording(false);
  }

  async function transcribe(simulationId: string) {
    const blob = new Blob(chunksRef.current, { type: pickMimeType() });
    chunksRef.current = [];
    if (blob.size < 900) {
      const fallback = speechTranscriptRef.current.trim();
      if (fallback.length >= 3) {
        setTranscript(fallback);
        return;
      }
      setVoiceError(
        `El navegador entregó un audio demasiado pequeño (${blob.size} bytes). Revisa el permiso del micrófono o escribe tu respuesta.`,
      );
      return;
    }
    const form = new FormData();
    form.set("audio", blob, "respuesta.webm");
    form.set(
      "duration",
      String(
        Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)),
      ),
    );
    form.set("simulationId", simulationId);
    const response = await fetch("/api/simulacro/voice/transcribe", {
      method: "POST",
      body: form,
    });
    const payload = (await response.json()) as {
      transcript?: string;
      error?: string;
    };
    if (!response.ok) {
      setVoiceError(payload.error || "No se pudo transcribir.");
      return;
    }
    setTranscript(payload.transcript || "");
  }

  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function startBrowserSpeech() {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    try {
      const recognition = new Recognition();
      recognition.lang = "es-BO";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let text = "";
        for (let index = 0; index < event.results.length; index += 1) {
          text += event.results[index][0]?.transcript || "";
        }
        speechTranscriptRef.current = text.trim();
      };
      recognition.start();
      speechRef.current = recognition;
    } catch {
      speechRef.current = null;
    }
  }

  function stopBrowserSpeech() {
    try {
      speechRef.current?.stop();
    } catch {}
    speechRef.current = null;
  }

  return (
    <div className="simulation-workspace">
      <section className="panel simulation-card">
        <span className="eyebrow">SIMULACRO DE EXAMEN DE GRADO</span>
        <h2>
          Unidad {unit.number} · {unit.name}
        </h2>
        <p>
          El examinador pregunta primero, escucha tu respuesta y guarda la
          retroalimentación para el final del simulacro.
        </p>
        {!simulation && (
          <form action={startAction} className="simulation-config">
            <input type="hidden" name="unitNumber" value={unit.number} />
            <div className="config-grid">
              <label>
                Nivel
                <select name="difficulty" defaultValue="intermedio">
                  <option value="basico">Básico</option>
                  <option value="intermedio">Intermedio</option>
                  <option value="avanzado">Avanzado</option>
                </select>
              </label>
              <label>
                Duración
                <select name="length" defaultValue="rapido">
                  <option value="rapido">
                    Rápido · 3 preguntas principales
                  </option>
                  <option value="completo">
                    Completo · 5 preguntas principales
                  </option>
                </select>
              </label>
            </div>
            <button className="button primary" disabled={starting}>
              <ClipboardCheck size={17} />
              {starting ? "Preparando pregunta..." : "Iniciar simulacro"}
            </button>
          </form>
        )}
        {simulation && (
          <form action={startAction} className="new-simulation-form">
            <input type="hidden" name="difficulty" value="intermedio" />
            <input type="hidden" name="length" value="rapido" />
            <input type="hidden" name="unitNumber" value={unit.number} />
            <button className="button secondary" disabled={starting}>
              <ClipboardCheck size={17} />
              {starting
                ? "Preparando nuevo simulacro..."
                : "Iniciar nuevo simulacro"}
            </button>
            <small>
              Inicia otro intento rápido de esta unidad con nivel intermedio y 3
              preguntas.
            </small>
          </form>
        )}
        {startState.error && <p className="notice error">{startState.error}</p>}
      </section>

      {simulation && (
        <section className="panel simulation-card exam-room">
          <div className="section-heading">
            <div>
              <h2>
                {simulation.status === "completed"
                  ? "Simulacro finalizado"
                  : simulation.progress_label}
              </h2>
              <span>Nivel {labelDifficulty(simulation.difficulty)}</span>
            </div>
            <span>
              {simulation.status === "completed"
                ? "Informe final"
                : "Responde y presiona Enviar para continuar"}
            </span>
          </div>

          {currentQuestion && (
            <article className="exam-question-card">
              <span>
                {currentQuestion.question_type === "follow_up"
                  ? "Repregunta"
                  : "Pregunta principal"}
              </span>
              <h3>{currentQuestion.question}</h3>
              <div className="simulation-actions compact-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => playQuestion(currentQuestion, simulation.id)}
                  disabled={audioState === "loading"}
                >
                  {audioState === "loading" ? (
                    <Loader2 className="spin-icon" size={16} />
                  ) : (
                    <Volume2 size={16} />
                  )}
                  Escuchar pregunta
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={stopAudio}
                  disabled={audioState !== "playing"}
                >
                  <X size={16} /> Detener audio
                </button>
              </div>
            </article>
          )}

          <div className="simulation-timeline compact">
            {simulation.questions
              .filter((question) => question.answer)
              .map((question) => (
                <article key={question.id}>
                  <strong>
                    Respuesta registrada · Pregunta {question.position}
                  </strong>
                  <p>{question.answer}</p>
                  {question.feedback && (
                    <div className="answer-feedback">
                      <h4>Retroalimentación del examinador</h4>
                      {question.feedback.strengths.length > 0 && (
                        <p>
                          <b>Qué estuvo bien:</b>{" "}
                          {question.feedback.strengths.join("; ")}
                        </p>
                      )}
                      {question.feedback.missingConcepts.length > 0 && (
                        <p>
                          <b>Qué faltó:</b>{" "}
                          {question.feedback.missingConcepts.join("; ")}
                        </p>
                      )}
                      <p>
                        <b>Respuesta correcta orientativa:</b>{" "}
                        {question.feedback.correctAnswer ||
                          question.model_answer ||
                          question.feedback.modelAnswer}
                      </p>
                      <p>
                        <b>Explicación sencilla:</b>{" "}
                        {question.feedback.didacticExplanation}
                      </p>
                      <p>
                        <b>Ejemplo didáctico generado:</b>{" "}
                        {question.feedback.didacticExample}
                      </p>
                      <p>
                        <b>Aplicación policial:</b>{" "}
                        {question.feedback.policeApplication}
                      </p>
                    </div>
                  )}
                </article>
              ))}
          </div>

          {currentQuestion && (
            <form action={answerAction} className="simulation-answer-form">
              <input type="hidden" name="simulationId" value={simulation.id} />
              <label>
                Tu respuesta oral o escrita
                <textarea
                  key={`${currentQuestion.id}-${transcript}`}
                  name="answer"
                  defaultValue={transcript}
                  minLength={3}
                  maxLength={2500}
                  required
                  rows={6}
                  placeholder="Responde como lo harías ante un tribunal..."
                />
              </label>
              <div className="simulation-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={answering}
                >
                  {recording ? <Square size={16} /> : <Mic size={16} />}
                  {recording ? "Detener grabación" : "Responder por voz"}
                </button>
                <button className="button primary" disabled={answering}>
                  {answering ? (
                    <Loader2 className="spin-icon" size={16} />
                  ) : (
                    <Send size={16} />
                  )}
                  Enviar respuesta y continuar
                </button>
              </div>
              {recording && (
                <p className="notice">
                  ESCUCHANDO... responde con calma y luego detén la grabación.
                </p>
              )}
              {!recording && !answering && (
                <p className="notice">
                  Para avanzar, escribe o graba tu respuesta y luego presiona
                  Enviar respuesta y continuar.
                </p>
              )}
              {answering && (
                <p className="notice">
                  TRANSCRIBIENDO Y ANALIZANDO RESPUESTA...
                </p>
              )}
              {voiceError && <p className="notice error">{voiceError}</p>}
              {answerState.error && (
                <p className="notice error">{answerState.error}</p>
              )}
            </form>
          )}
        </section>
      )}

      {simulation?.result && (
        <section className="panel simulation-result">
          <Trophy size={26} />
          <h2>Resultado del simulacro</h2>
          <p>{simulation.result.disclaimer}</p>
          <strong className="score">{simulation.result.total}/100</strong>
          <div className="rubric-grid">
            <span>Dominio conceptual: {simulation.result.conceptual}/30</span>
            <span>
              Aplicación / comprensión: {simulation.result.application}/20
            </span>
            <span>
              Precisión terminológica: {simulation.result.terminology}/20
            </span>
            <span>Argumentación: {simulation.result.argumentation}/20</span>
            <span>Claridad y estructura: {simulation.result.clarity}/10</span>
          </div>
          <h3>Fortalezas</h3>
          <ul>
            {simulation.result.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Aspectos a mejorar</h3>
          <ul>
            {simulation.result.improvements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h3>Conceptos omitidos</h3>
          <p>
            {simulation.result.concepts_omitted.join(", ") ||
              "Sin omisiones críticas registradas."}
          </p>
          <h3>Temas recomendados para repasar</h3>
          <p>
            {simulation.result.review_topics.join(", ") || "Doctrina Policial"}
          </p>

          <div className="simulation-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => setShowModels((value) => !value)}
            >
              <Play size={16} /> Ver cómo podría responder
            </button>
            <form action={practiceAction}>
              <input type="hidden" name="simulationId" value={simulation.id} />
              <button className="button primary" disabled={practicing}>
                {practicing ? (
                  <Loader2 className="spin-icon" size={16} />
                ) : (
                  <ClipboardCheck size={16} />
                )}
                Practicar mis errores
              </button>
            </form>
            <form action={startAction}>
              <input type="hidden" name="difficulty" value="intermedio" />
              <input type="hidden" name="length" value="rapido" />
              <input type="hidden" name="unitNumber" value={unit.number} />
              <button className="button secondary" disabled={starting}>
                <ClipboardCheck size={16} />
                {starting ? "Preparando..." : "Iniciar nuevo simulacro"}
              </button>
            </form>
          </div>
          {practiceState.practiceQuestion && (
            <article className="exam-question-card reinforcement">
              <span>Pregunta de refuerzo</span>
              <h3>{practiceState.practiceQuestion}</h3>
            </article>
          )}
          {practiceState.error && (
            <p className="notice error">{practiceState.error}</p>
          )}
          {showModels && (
            <div className="model-answer-list">
              {simulation.result.model_answers.map((item) => (
                <article key={item.question}>
                  <strong>{item.question}</strong>
                  <p>{item.answer}</p>
                </article>
              ))}
            </div>
          )}
          {simulation.result.error_reviews.length > 0 && (
            <div className="model-answer-list">
              <h3>Explicación de errores</h3>
              {simulation.result.error_reviews.map((item) => (
                <article key={item.question}>
                  <strong>{item.question}</strong>
                  <p>
                    <b>Qué dijo:</b> {item.studentAnswer}
                  </p>
                  <p>
                    <b>Qué estuvo bien:</b> {item.whatWasGood.join("; ")}
                  </p>
                  <p>
                    <b>Qué faltó:</b> {item.whatWasMissing.join("; ")}
                  </p>
                  <p>
                    <b>Cómo explicarlo mejor:</b> {item.betterExplanation}
                  </p>
                  <p>
                    <b>Ejemplo didáctico:</b> {item.didacticExample}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function labelDifficulty(value: string) {
  if (value === "basico") return "básico";
  if (value === "avanzado") return "avanzado";
  return "intermedio";
}

function pickMimeType() {
  if (
    typeof MediaRecorder !== "undefined" &&
    MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
  ) {
    return "audio/webm;codecs=opus";
  }
  return "audio/webm";
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

export function selectVisibleSimulation(
  answerSimulation: SimulationState | undefined,
  startedSimulation: SimulationState | undefined,
  initialSimulation: SimulationState | null,
) {
  if (startedSimulation && startedSimulation.id !== answerSimulation?.id) {
    return startedSimulation;
  }
  return answerSimulation || startedSimulation || initialSimulation;
}
