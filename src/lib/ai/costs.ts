import "server-only";

const textInputCostPerMillion = Number(
  process.env.OPENAI_TEXT_INPUT_COST_PER_1M || "0.4",
);
const textOutputCostPerMillion = Number(
  process.env.OPENAI_TEXT_OUTPUT_COST_PER_1M || "1.6",
);
const sttCostPerMinute = Number(
  process.env.OPENAI_STT_COST_PER_MINUTE || "0.003",
);
const ttsCostPerMinute = Number(
  process.env.OPENAI_TTS_COST_PER_MINUTE || "0.015",
);

export function estimateTextCost(inputTokens: number, outputTokens: number) {
  return (
    (inputTokens / 1_000_000) * textInputCostPerMillion +
    (outputTokens / 1_000_000) * textOutputCostPerMillion
  );
}

export function estimateAudioInputCost(seconds: number) {
  return (Math.max(0, seconds) / 60) * sttCostPerMinute;
}

export function estimateAudioOutputCost(seconds: number) {
  return (Math.max(0, seconds) / 60) * ttsCostPerMinute;
}

export function estimateSpeechSeconds(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round((words / 145) * 60));
}
