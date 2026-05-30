export const SUPPORTED_AI_MODELS = [
  // "openai/gpt-5.5-pro",
  // "openai/gpt-5.5",
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
  "google/gemini-3-pro-preview",
  "google/gemini-3.5-flash",
  "google/gemini-3-flash",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "google/gemma-4-26b-a4b-it",
  "google/gemma-4-31b-it",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
  "deepseek/deepseek-v3.2",
  "alibaba/qwen3.7-max",
  "alibaba/qwen3.6-27b",
  // "anthropic/claude-opus-4.8",
  // "anthropic/claude-opus-4.7",
  // "anthropic/claude-opus-4.6",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5",
  "moonshotai/kimi-k2.6",
  "moonshotai/kimi-k2.5",
  "moonshotai/kimi-k2",
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-nano-30b-a3b",
  "nvidia/nemotron-nano-9b-v2",
  "nvidia/nemotron-nano-12b-v2-vl",
  "xai/grok-4.3"
] as const;

export type SupportedAiModel = (typeof SUPPORTED_AI_MODELS)[number];

export const PDF_CAPABLE_AI_MODELS = [
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5",
  "openai/gpt-5-pro",
  "openai/o3",
  "openai/o3-pro",
  "anthropic/claude-sonnet-4.6",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5",
] as const satisfies readonly SupportedAiModel[];

export type PdfCapableAiModel = (typeof PDF_CAPABLE_AI_MODELS)[number];

export function isSupportedAiModel(value: string): value is SupportedAiModel {
  return SUPPORTED_AI_MODELS.includes(value as SupportedAiModel);
}

export function getSupportedAiModels(): SupportedAiModel[] {
  return [...SUPPORTED_AI_MODELS];
}

export function isPdfCapableAiModel(value: string): value is PdfCapableAiModel {
  return PDF_CAPABLE_AI_MODELS.includes(value as PdfCapableAiModel);
}

export function getPdfCapableAiModels(): PdfCapableAiModel[] {
  return [...PDF_CAPABLE_AI_MODELS];
}
