import "server-only";

export type CostUnit = "token" | "minute" | "character";

export type ModelPricing = {
  model: string;
  inputPerMillionTokens?: number;
  cachedInputPerMillionTokens?: number;
  outputPerMillionTokens?: number;
  audioInputPerMinute?: number;
  audioOutputPerMinute?: number;
  audioOutputPerMillionCharacters?: number;
  embeddingPerMillionTokens?: number;
  pricingVersion: string;
};

const pricingVersion = process.env.AI_PRICING_VERSION || "2026-09-config";

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

const defaultTextInput = envNumber("OPENAI_TEXT_INPUT_COST_PER_1M", 0.4);
const defaultTextOutput = envNumber("OPENAI_TEXT_OUTPUT_COST_PER_1M", 1.6);
const defaultCachedInput = envNumber("OPENAI_CACHED_INPUT_COST_PER_1M", 0);

export function resolveModelPricing(model: string): ModelPricing {
  if (model === "gpt-5.6-luna") {
    return {
      model,
      inputPerMillionTokens: envNumber("OPENAI_LUNA_INPUT_COST_PER_1M", defaultTextInput),
      cachedInputPerMillionTokens: envNumber("OPENAI_LUNA_CACHED_INPUT_COST_PER_1M", defaultCachedInput),
      outputPerMillionTokens: envNumber("OPENAI_LUNA_OUTPUT_COST_PER_1M", defaultTextOutput),
      pricingVersion,
    };
  }
  if (model === "gpt-5.6-terra") {
    return {
      model,
      inputPerMillionTokens: envNumber("OPENAI_TERRA_INPUT_COST_PER_1M", envNumber("OPENAI_TEXT_COMPLEX_INPUT_COST_PER_1M", 2)),
      cachedInputPerMillionTokens: envNumber("OPENAI_TERRA_CACHED_INPUT_COST_PER_1M", defaultCachedInput),
      outputPerMillionTokens: envNumber("OPENAI_TERRA_OUTPUT_COST_PER_1M", envNumber("OPENAI_TEXT_COMPLEX_OUTPUT_COST_PER_1M", 12)),
      pricingVersion,
    };
  }
  if (model === "text-embedding-3-small") {
    return {
      model,
      embeddingPerMillionTokens: envNumber("OPENAI_EMBEDDING_COST_PER_1M", 0.02),
      pricingVersion,
    };
  }
  if (model.includes("transcribe")) {
    return {
      model,
      inputPerMillionTokens: defaultTextInput,
      outputPerMillionTokens: defaultTextOutput,
      audioInputPerMinute: envNumber("OPENAI_STT_COST_PER_MINUTE", 0.003),
      pricingVersion,
    };
  }
  if (model.includes("tts") || model === "tts-1" || model === "tts-1-hd") {
    return {
      model,
      inputPerMillionTokens: defaultTextInput,
      outputPerMillionTokens: defaultTextOutput,
      audioOutputPerMinute: envNumber("OPENAI_TTS_COST_PER_MINUTE", 0.015),
      audioOutputPerMillionCharacters: envNumber("OPENAI_TTS_COST_PER_1M_CHARS", model === "tts-1-hd" ? 30 : 15),
      pricingVersion,
    };
  }
  return {
    model,
    inputPerMillionTokens: defaultTextInput,
    cachedInputPerMillionTokens: defaultCachedInput,
    outputPerMillionTokens: defaultTextOutput,
    pricingVersion,
  };
}

export function estimateModelCost(input: {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  audioInputSeconds?: number;
  audioOutputSeconds?: number;
  outputCharacters?: number;
  embeddingTokens?: number;
}) {
  const pricing = resolveModelPricing(input.model);
  const cachedInputTokens = Math.max(0, input.cachedInputTokens || 0);
  const totalInputTokens = Math.max(0, input.inputTokens || 0);
  const regularInputTokens = Math.max(0, totalInputTokens - cachedInputTokens);
  const textInputCost = (regularInputTokens / 1_000_000) * (pricing.inputPerMillionTokens || 0);
  const cachedInputCost =
    (cachedInputTokens / 1_000_000) *
    (pricing.cachedInputPerMillionTokens ?? pricing.inputPerMillionTokens ?? 0);
  const outputCost =
    (Math.max(0, input.outputTokens || 0) / 1_000_000) *
    (pricing.outputPerMillionTokens || 0);
  const embeddingCost =
    (Math.max(0, input.embeddingTokens || 0) / 1_000_000) *
    (pricing.embeddingPerMillionTokens || 0);
  const audioInputCost =
    (Math.max(0, input.audioInputSeconds || 0) / 60) *
    (pricing.audioInputPerMinute || 0);
  const audioOutputMinuteCost =
    (Math.max(0, input.audioOutputSeconds || 0) / 60) *
    (pricing.audioOutputPerMinute || 0);
  const audioOutputCharacterCost =
    (Math.max(0, input.outputCharacters || 0) / 1_000_000) *
    (pricing.audioOutputPerMillionCharacters || 0);
  const audioOutputCost = pricing.audioOutputPerMillionCharacters
    ? audioOutputCharacterCost
    : audioOutputMinuteCost;
  return textInputCost + cachedInputCost + outputCost + embeddingCost + audioInputCost + audioOutputCost;
}

export function estimateTextCost(
  inputTokens: number,
  outputTokens: number,
  model = process.env.OPENAI_FAST_MODEL || process.env.OPENAI_MODEL || "gpt-5.6-luna",
) {
  return estimateModelCost({ model, inputTokens, outputTokens });
}

export function estimateAudioInputCost(
  seconds: number,
  model = process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe",
) {
  return estimateModelCost({ model, audioInputSeconds: seconds });
}

export function estimateAudioOutputCost(input: {
  seconds: number;
  text?: string;
  model?: string;
}) {
  return estimateModelCost({
    model: input.model || process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
    audioOutputSeconds: input.seconds,
    outputCharacters: input.text?.length || 0,
  });
}

export function estimateSpeechSeconds(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / 145) * 60));
}

export function pricingCatalogSummary(models: string[]) {
  return models.map((model) => resolveModelPricing(model));
}
