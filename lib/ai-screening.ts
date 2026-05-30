import { generateText, gateway, streamText } from "ai";
import { ResultStatus } from "@/generated/prisma/client";
import { type SupportedAiModel } from "@/lib/ai-models";

export type ScreeningCriterionItem = {
  criteriaId: string;
  nama: string;
};

export type ScreeningCriteriaContext = {
  inclusionCriteria: ScreeningCriterionItem[];
  exclusionCriteria: ScreeningCriterionItem[];
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
  criteriaAssessments: ParsedCriterionAssessment[];
};

export type ParsedCriterionAssessment = {
  criteriaId: string;
  hasil: boolean;
};

type AnalyzeReferenceParams = {
  model: SupportedAiModel;
  criteria: ScreeningCriteriaContext;
  reference: ScreeningReferenceInput;
};

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeList(items: ScreeningCriterionItem[]): ScreeningCriterionItem[] {
  return items
    .map((item) => ({
      criteriaId: item.criteriaId.trim(),
      nama: item.nama.trim(),
    }))
    .filter((item) => item.criteriaId.length > 0 && item.nama.length > 0);
}

function toListText(items: ScreeningCriterionItem[], emptyMessage: string): string {
  if (items.length === 0) {
    return `- ${emptyMessage}`;
  }

  return items
    .map((item, index) => `${index + 1}. [ID:${item.criteriaId}] ${item.nama}`)
    .join("\n");
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

function normalizeCriteriaId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }

    return value !== 0;
  }

  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim().toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "ya",
      "y",
      "memenuhi",
      "sesuai",
      "match",
      "included",
      "inclusion",
    ].includes(text)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "tidak",
      "n",
      "tidak memenuhi",
      "tidak sesuai",
      "excluded",
      "exclusion",
    ].includes(text)
  ) {
    return false;
  }

  if (text.includes("tidak")) {
    return false;
  }

  if (text.includes("memenuhi")) {
    return true;
  }

  return null;
}

function extractJsonObject(raw: string): JsonObject | null {
  const candidates: string[] = [];
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fencedMatch?.[1]) {
    candidates.push(fencedMatch[1].trim());
  }

  candidates.push(raw.trim());

  for (const candidate of candidates) {
    const firstCurly = candidate.indexOf("{");

    if (firstCurly === -1) {
      continue;
    }

    for (
      let endCurly = candidate.lastIndexOf("}");
      endCurly > firstCurly;
      endCurly = candidate.lastIndexOf("}", endCurly - 1)
    ) {
      const jsonFragment = candidate.slice(firstCurly, endCurly + 1);

      try {
        const parsed = JSON.parse(jsonFragment) as unknown;

        if (isJsonObject(parsed)) {
          return parsed;
        }
      } catch {
        // Try next JSON fragment candidate.
      }
    }
  }

  return null;
}

function extractCriteriaAssessments(raw: unknown): ParsedCriterionAssessment[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const map = new Map<string, boolean>();

  for (const item of raw) {
    if (!isJsonObject(item)) {
      continue;
    }

    const criteriaId = normalizeCriteriaId(item.criteriaId ?? item.id);
    const hasil = normalizeBoolean(
      item.hasil ?? item.result ?? item.memenuhi ?? item.match ?? item.matched,
    );

    if (!criteriaId || hasil === null) {
      continue;
    }

    map.set(criteriaId, hasil);
  }

  return Array.from(map.entries()).map(([criteriaId, hasil]) => ({
    criteriaId,
    hasil,
  }));
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
    "Evaluasi semua criteria yang diberikan, lalu tentukan untuk setiap criteria apakah memenuhi (true) atau tidak (false).",
    "Penting: gunakan criteriaId persis sama seperti di daftar. Jangan menambah criteriaId lain.",
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
    "Output wajib JSON valid tanpa markdown code block:",
    "{",
    '  "hasil": "Included" | "Excluded",',
    '  "justifikasi": "<alasan singkat>",',
    '  "criteria": [',
    '    { "criteriaId": "<ID_CRITERIA>", "hasil": true | false }',
    "  ]",
    "}",
    "Pastikan semua criteria dari Inclusion dan Exclusion muncul tepat satu kali di array criteria.",
  ].join("\n");
}

export function parseScreeningOutput(rawText: string): ParsedScreeningResult {
  const resultLine = rawText.match(/hasil\s*:\s*(.+)/i)?.[1] ?? rawText;
  const jsonObject = extractJsonObject(rawText);

  const rawHasilFromJson = jsonObject?.hasil ?? jsonObject?.result;
  const hasil =
    typeof rawHasilFromJson === "string"
      ? normalizeDecision(rawHasilFromJson)
      : normalizeDecision(resultLine);

  const justifikasi =
    jsonObject && typeof jsonObject.justifikasi === "string"
      ? jsonObject.justifikasi.trim() || extractJustification(rawText)
      : jsonObject && typeof jsonObject.justification === "string"
        ? jsonObject.justification.trim() || extractJustification(rawText)
        : extractJustification(rawText);

  const criteriaAssessments = extractCriteriaAssessments(
    jsonObject?.criteria ?? jsonObject?.criteriaResults,
  );

  return {
    hasil,
    justifikasi,
    criteriaAssessments,
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
