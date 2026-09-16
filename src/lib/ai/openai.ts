import "server-only";

export type OpenAITextResult = {
  text: string;
  model: string;
  requestId: string | null;
  inputTokens: number;
  outputTokens: number;
};

type ResponsesApiBody = {
  id?: string;
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

export async function generateTutorText(input: {
  system: string;
  user: string;
  maxOutputTokens?: number;
}): Promise<OpenAITextResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no configurada.");
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      max_output_tokens: input.maxOutputTokens ?? 900,
    }),
  });
  if (!response.ok)
    throw new Error(await openAIError("OpenAI texto", response));
  const body = (await response.json()) as ResponsesApiBody;
  const text =
    body.output_text ||
    body.output
      ?.flatMap((item) => item.content || [])
      .map((part) => part.text || "")
      .join("\n")
      .trim();
  if (!text) throw new Error("OpenAI no devolvió texto utilizable.");
  return {
    text,
    model,
    requestId: body.id || null,
    inputTokens: body.usage?.input_tokens || 0,
    outputTokens: body.usage?.output_tokens || 0,
  };
}

export type OpenAIAudioResult = {
  model: string;
  requestId: string | null;
  inputTokens: number;
  outputTokens: number;
};

export type OpenAITranscriptionResult = OpenAIAudioResult & {
  text: string;
};

type TranscriptionBody = {
  id?: string;
  text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

export async function transcribeAudio(input: {
  audio: File;
  language?: string;
}): Promise<OpenAITranscriptionResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no configurada.");
  const model = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe";
  const form = new FormData();
  form.set("model", model);
  form.set("file", input.audio);
  form.set("response_format", "json");
  if (input.language) form.set("language", input.language);
  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    },
  );
  if (!response.ok)
    throw new Error(await openAIError("OpenAI STT", response));
  const body = (await response.json()) as TranscriptionBody;
  const text = body.text?.trim();
  if (!text) throw new Error("OpenAI no devolvió transcripción utilizable.");
  return {
    text,
    model,
    requestId: body.id || null,
    inputTokens: body.usage?.input_tokens || body.usage?.total_tokens || 0,
    outputTokens: body.usage?.output_tokens || 0,
  };
}

export async function synthesizeSpeech(input: {
  text: string;
  voice?: string;
}): Promise<OpenAIAudioResult & { audio: ArrayBuffer; contentType: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY no configurada.");
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice: input.voice || process.env.OPENAI_TTS_VOICE || "alloy",
      input: input.text,
      response_format: "mp3",
      instructions:
        "Voz clara, natural y pausada para un estudiante policial boliviano. Mantén tono docente, breve y seguro.",
    }),
  });
  if (!response.ok)
    throw new Error(await openAIError("OpenAI TTS", response));
  return {
    audio: await response.arrayBuffer(),
    contentType: response.headers.get("content-type") || "audio/mpeg",
    model,
    requestId: response.headers.get("openai-request-id"),
    inputTokens: estimateTokens(input.text),
    outputTokens: 0,
  };
}

export function estimateTokens(text: string) {
  return Math.max(
    1,
    Math.ceil(text.trim().split(/\s+/).filter(Boolean).length * 1.35),
  );
}

async function openAIError(scope: string, response: Response) {
  const text = await response.text().catch(() => "");
  let detail = text.slice(0, 240);
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    detail = parsed.error?.message || detail;
  } catch {}
  return `${scope} respondió con estado ${response.status}${detail ? `: ${detail}` : ""}`;
}
