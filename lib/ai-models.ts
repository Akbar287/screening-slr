export const SUPPORTED_AI_MODELS = [
  "openai/gpt-5.5-pro",
  "openai/gpt-5.5",
  "openai/gpt-5.4",
  "openai/gpt-5.4-nano",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.2",
  "openai/gpt-5",
  "openai/gpt-5-pro",
  "openai/o3",
  "openai/o3-pro",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v3.2",
  "alibaba/qwen3.7-max",
  "alibaba/qwen3.6-27b",
  "anthropic/claude-opus-4.8",
  "anthropic/claude-opus-4.7",
  "anthropic/claude-opus-4.6",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5",
  "moonshotai/kimi-k2.5",
] as const;

export type SupportedAiModel = (typeof SUPPORTED_AI_MODELS)[number];

export function isSupportedAiModel(value: string): value is SupportedAiModel {
  return SUPPORTED_AI_MODELS.includes(value as SupportedAiModel);
}

export function getSupportedAiModels(): SupportedAiModel[] {
  return [...SUPPORTED_AI_MODELS];
}
