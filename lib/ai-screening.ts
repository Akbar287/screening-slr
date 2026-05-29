import { generateText, gateway, streamText } from "ai";
import { ResultStatus } from "@/generated/prisma/client";
import { type SupportedAiModel } from "@/lib/ai-models";


export type ScreeningCriteriaContext = {
  inclusionCriteria: string[];
  exclusionCriteria: string[];
};

export type ScreeningReferenceInput = {
  citationKey: string;
  entryType: string;
  title: string | null;
  abstract: string | null;
  year: number | null;
  journal: string | null;
  publisher: string | null;
};

export type ParsedScreeningResult = {
  hasil: ResultStatus;
  justifikasi: string;
};

type AnalyzeReferenceParams = {
  model: SupportedAiModel;
  criteria: ScreeningCriteriaContext;
  reference: ScreeningReferenceInput;
};

function normalizeList(items: string[]): string[] {
  return items
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toListText(items: string[], emptyMessage: string): string {
  if (items.length === 0) {
    return `- ${emptyMessage}`;
  }

  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function normalizeDecision(raw: string): ResultStatus {
  const text = raw.trim().toLowerCase();

  if (text.includes("excluded") || text.includes("exclusion")) {
    return ResultStatus.Excluded;
  }

  if (text.includes("included") || text.includes("inclusion")) {
    return ResultStatus.Included;
  }

  return ResultStatus.Excluded;
}

function extractJustification(raw: string): string {
  const lineMatch = raw.match(/justifikasi\s*:\s*(.+)/i);
  if (lineMatch?.[1]) {
    return lineMatch[1].trim();
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const value =
        typeof parsed.justifikasi === "string"
          ? parsed.justifikasi
          : typeof parsed.justification === "string"
            ? parsed.justification
            : "";

      if (value.trim().length > 0) {
        return value.trim();
      }
    } catch {
      // Ignore JSON parse error and use fallback below.
    }
  }

  return raw.trim().slice(0, 1000) || "Model tidak memberikan justifikasi.";
}

export function buildScreeningPrompt({
  criteria,
  reference,
}: {
  criteria: ScreeningCriteriaContext;
  reference: ScreeningReferenceInput;
}): string {
  const inclusionList = normalizeList(criteria.inclusionCriteria);
  const exclusionList = normalizeList(criteria.exclusionCriteria);

  return [
    "Anda adalah asisten screening untuk Systematic Literature Review (SLR).",
    "Tugas Anda: analisa berdasarkan abstract 1 references dan Inclusion Criteria Exclusion Criteria.",
    "Pertanyaan: apakah references ini bisa dimasukan untuk dilanjutkan ke proses SLR.",
    "Jika ya, jawab Included. Jika tidak, jawab Excluded.",
    "Berikan justifikasi singkat, spesifik, dan berbasis abstract.",
    "",
    "Inclusion Criteria:",
    toListText(inclusionList, "Tidak ada data inclusion criteria."),
    "",
    "Exclusion Criteria:",
    toListText(exclusionList, "Tidak ada data exclusion criteria."),
    "",
    "Data Reference:",
    `- Citation Key: ${reference.citationKey}`,
    `- Entry Type: ${reference.entryType}`,
    `- Title: ${reference.title?.trim() || "(tanpa judul)"}`,
    `- Year: ${reference.year ?? "(tanpa tahun)"}`,
    `- Journal: ${reference.journal?.trim() || "(tanpa journal)"}`,
    `- Publisher: ${reference.publisher?.trim() || "(tanpa publisher)"}`,
    `- Abstract: ${reference.abstract?.trim() || "(tanpa abstract)"}`,
    "",
    "Output wajib dalam format ini:",
    "Hasil: Included atau Excluded",
    "Justifikasi: <alasan singkat>",
  ].join("\n");
}

export function parseScreeningOutput(rawText: string): ParsedScreeningResult {
  const resultLine = rawText.match(/hasil\s*:\s*(.+)/i)?.[1] ?? rawText;
  const hasil = normalizeDecision(resultLine);
  const justifikasi = extractJustification(rawText);

  return {
    hasil,
    justifikasi,
  };
}

export async function analyzeReferenceWithAi({
  model,
  criteria,
  reference,
}: AnalyzeReferenceParams): Promise<ParsedScreeningResult> {
  const prompt = buildScreeningPrompt({ criteria, reference });

  const { text } = await generateText({
    model: gateway(model),
    prompt,
    temperature: 0.1,
    maxOutputTokens: 400,
    maxRetries: 1,
    timeout: {
      totalMs: 45_000,
    },
  });

  return parseScreeningOutput(text);
}

export async function streamScreeningText({
  model,
  criteria,
  reference,
}: AnalyzeReferenceParams): Promise<AsyncIterable<string>> {
  const prompt = buildScreeningPrompt({ criteria, reference });

  const result = streamText({
    model: gateway(model),
    prompt,
    temperature: 0.15,
    maxOutputTokens: 400,
  });

  return result.textStream;
}
