import { generateText, gateway } from "ai";
import { ResultStatus } from "@/generated/prisma/client";
import {
  type ParsedCriterionAssessment,
  parseScreeningOutput,
  type ScreeningCriteriaContext,
} from "@/lib/ai-screening";
import { type PdfCapableAiModel } from "@/lib/ai-models";

const MAX_MARKDOWN_CONTEXT_CHARS = 16_000;

export type FullTextScreeningInput = {
  citationKey: string;
  entryType: string;
  title: string | null;
  year: number | null;
  journal: string | null;
  publisher: string | null;
  doi: string | null;
  markdownText?: string;
  pdfBytes: Uint8Array;
  pdfFileName?: string | null;
};

export type ParsedFullTextScreeningResult = {
  hasil: ResultStatus;
  justifikasi: string;
  criteriaAssessments: ParsedCriterionAssessment[];
};

function normalizeListText(items: ScreeningCriteriaContext["inclusionCriteria"]): string {
  if (items.length === 0) {
    return "- Tidak ada data criteria.";
  }

  return items
    .map((item, index) => `${index + 1}. [ID:${item.criteriaId}] ${item.nama}`)
    .join("\n");
}

function clipText(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}\n\n[TRUNCATED]`;
}

function normalizePdfFileName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    return "full-text.pdf";
  }

  return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`;
}

export function buildFullTextScreeningPrompt({
  criteria,
  fullText,
}: {
  criteria: ScreeningCriteriaContext;
  fullText: FullTextScreeningInput;
}): string {
  const markdownBody = clipText(fullText.markdownText ?? "", MAX_MARKDOWN_CONTEXT_CHARS);

  return [
    "Anda adalah asisten screening untuk Systematic Literature Review (SLR).",
    "Tugas: evaluasi full-text paper terhadap Inclusion dan Exclusion Criteria.",
    "File PDF full-text dilampirkan pada input user (application/pdf). Gunakan isi PDF sebagai sumber utama evaluasi.",
    "Keputusan akhir wajib salah satu: Included atau Excluded.",
    "Jika layak lanjut proses SLR jawab Included, jika tidak layak jawab Excluded.",
    "Berikan justifikasi ringkas, jelas, berbasis isi full-text.",
    "Evaluasi semua criteria yang diberikan; setiap criteria harus bernilai true atau false.",
    "Gunakan criteriaId persis seperti daftar, jangan menambah criteriaId lain.",
    "",
    "Inclusion Criteria:",
    normalizeListText(criteria.inclusionCriteria),
    "",
    "Exclusion Criteria:",
    normalizeListText(criteria.exclusionCriteria),
    "",
    "Metadata Reference:",
    `- Citation Key: ${fullText.citationKey}`,
    `- Entry Type: ${fullText.entryType}`,
    `- Title: ${fullText.title?.trim() || "(tanpa judul)"}`,
    `- Year: ${fullText.year ?? "(tanpa tahun)"}`,
    `- Journal: ${fullText.journal?.trim() || "(tanpa journal)"}`,
    `- Publisher: ${fullText.publisher?.trim() || "(tanpa publisher)"}`,
    `- DOI: ${fullText.doi?.trim() || "(tanpa doi)"}`,
    "",
    "Preview Markdown Tambahan (hasil konversi PDF, opsional):",
    markdownBody || "(kosong)",
    "",
    "Output wajib JSON valid tanpa markdown code block:",
    "{",
    '  "hasil": "Included" | "Excluded",',
    '  "justifikasi": "<alasan singkat>",',
    '  "criteria": [',
    '    { "criteriaId": "<ID_CRITERIA>", "hasil": true | false }',
    "  ]",
    "}",
    "Pastikan semua criteria Inclusion dan Exclusion muncul tepat satu kali pada array criteria.",
  ].join("\n");
}

export async function analyzeFullTextWithAi({
  model,
  criteria,
  fullText,
}: {
  model: PdfCapableAiModel;
  criteria: ScreeningCriteriaContext;
  fullText: FullTextScreeningInput;
}): Promise<ParsedFullTextScreeningResult> {
  const prompt = buildFullTextScreeningPrompt({
    criteria,
    fullText,
  });

  const { text } = await generateText({
    model: gateway(model),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "file",
            mediaType: "application/pdf",
            data: fullText.pdfBytes,
            filename: normalizePdfFileName(fullText.pdfFileName),
          },
        ],
      },
    ],
    temperature: 0.1,
    maxOutputTokens: 500,
    maxRetries: 1,
    timeout: {
      totalMs: 60_000,
    },
  });

  const parsed = parseScreeningOutput(text);

  return {
    hasil: parsed.hasil,
    justifikasi: parsed.justifikasi,
    criteriaAssessments: parsed.criteriaAssessments,
  };
}
