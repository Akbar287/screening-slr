import { getServerSession } from "next-auth";
import { ResultStatus } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import {
  analyzeFullTextWithAi,
  type ParsedFullTextScreeningResult,
} from "@/lib/ai-fulltext-screening";
import { type PdfCapableAiModel, isPdfCapableAiModel } from "@/lib/ai-models";
import { authOptions } from "@/lib/auth-options";
import {
  type ParsedCriterionAssessment,
  type ScreeningCriteriaContext,
} from "@/lib/ai-screening";
import { CRITERIA_KIND_CONFIG, matchesCriteriaAlias } from "@/lib/criteria-kind";
import { prisma } from "@/lib/prisma";

type FullTextScreeningPayload = {
  mode?: unknown;
  hasil?: unknown;
  model?: unknown;
  justifikasi?: unknown;
};

type FullTextScreeningMode = "manual" | "ai";

function parseUserId(value: string | null | undefined): bigint | null {
  if (!value) {
    return null;
  }

  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parseBigIntId(value: string): bigint | null {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function parseMode(value: unknown): FullTextScreeningMode | null {
  if (value === "manual" || value === "ai") {
    return value;
  }

  return null;
}

function parseResultStatus(value: unknown): ResultStatus | null {
  if (value === "Included") {
    return ResultStatus.Included;
  }

  if (value === "Excluded") {
    return ResultStatus.Excluded;
  }

  return null;
}

function normalizeModel(value: unknown): PdfCapableAiModel | null {
  const candidate = typeof value === "string" ? value.trim() : "";
  return isPdfCapableAiModel(candidate) ? candidate : null;
}

function normalizeManualJustification(value: unknown, fallbackHasil: ResultStatus): string {
  const candidate = typeof value === "string" ? value.trim() : "";

  if (candidate.length > 0) {
    return candidate;
  }

  return fallbackHasil === ResultStatus.Included
    ? "Dipilih Included secara manual oleh user pada full-text screening."
    : "Dipilih Excluded secara manual oleh user pada full-text screening.";
}

function mapAssessmentsById(items: ParsedCriterionAssessment[]): Map<string, boolean> {
  return new Map(items.map((item) => [item.criteriaId, item.hasil]));
}

async function getAuthenticatedUserId(): Promise<bigint | null> {
  const session = await getServerSession(authOptions);
  return parseUserId(session?.user?.id);
}

async function getCriteriaContext(userId: bigint): Promise<ScreeningCriteriaContext> {
  const typeCriteriaRows = await prisma.typeCriteria.findMany({
    select: {
      id: true,
      nama: true,
    },
  });

  const inclusionType = typeCriteriaRows.find((row) =>
    matchesCriteriaAlias(row.nama, CRITERIA_KIND_CONFIG.inclusion.aliases),
  );
  const exclusionType = typeCriteriaRows.find((row) =>
    matchesCriteriaAlias(row.nama, CRITERIA_KIND_CONFIG.exclusion.aliases),
  );

  const typeIds = [inclusionType?.id, exclusionType?.id].filter(
    (id): id is bigint => typeof id === "bigint",
  );

  if (typeIds.length === 0) {
    return {
      inclusionCriteria: [],
      exclusionCriteria: [],
    };
  }

  const criteriaRows = await prisma.criteria.findMany({
    where: {
      userId,
      typeCriteriaId: {
        in: typeIds,
      },
    },
    orderBy: [{ urutan: "asc" }, { id: "asc" }],
    select: {
      id: true,
      nama: true,
      typeCriteriaId: true,
    },
  });

  return {
    inclusionCriteria: criteriaRows
      .filter((item) => (inclusionType ? item.typeCriteriaId === inclusionType.id : false))
      .map((item) => ({
        criteriaId: item.id.toString(),
        nama: item.nama,
      })),
    exclusionCriteria: criteriaRows
      .filter((item) => (exclusionType ? item.typeCriteriaId === exclusionType.id : false))
      .map((item) => ({
        criteriaId: item.id.toString(),
        nama: item.nama,
      })),
  };
}

function decodeMarkdownBytes(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

async function upsertResultFullText({
  fullTextId,
  hasil,
  justifikasi,
  ai,
}: {
  fullTextId: bigint;
  hasil: ResultStatus;
  justifikasi: string;
  ai: string;
}) {
  const existingRows = await prisma.resultFullText.findMany({
    where: {
      fullTextId,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
    },
  });

  if (existingRows.length === 0) {
    return prisma.resultFullText.create({
      data: {
        fullTextId,
        hasil,
        justifikasi,
        ai,
      },
      select: {
        id: true,
        hasil: true,
      },
    });
  }

  const primary = existingRows[0];
  const duplicateIds = existingRows.slice(1).map((item) => item.id);

  const [updated] = await prisma.$transaction([
    prisma.resultFullText.update({
      where: {
        id: primary.id,
      },
      data: {
        hasil,
        justifikasi,
        ai,
      },
      select: {
        id: true,
        hasil: true,
      },
    }),
    ...(duplicateIds.length > 0
      ? [
        prisma.resultFullText.deleteMany({
          where: {
            id: {
              in: duplicateIds,
            },
          },
        }),
      ]
      : []),
  ]);

  return updated;
}

async function replaceResultFullTextCriteriaRows({
  resultFullTextId,
  criteriaContext,
  assessments,
}: {
  resultFullTextId: bigint;
  criteriaContext: ScreeningCriteriaContext;
  assessments: ParsedCriterionAssessment[];
}) {
  const mergedCriteria = [
    ...criteriaContext.inclusionCriteria,
    ...criteriaContext.exclusionCriteria,
  ];

  if (mergedCriteria.length === 0) {
    await prisma.resultFullTextCriteria.deleteMany({
      where: {
        resultFullTextId,
      },
    });
    return;
  }

  const assessmentMap = mapAssessmentsById(assessments);

  const rows = mergedCriteria
    .map((item) => {
      try {
        return {
          resultFullTextId,
          criteriaId: BigInt(item.criteriaId),
          result: assessmentMap.get(item.criteriaId) === true,
        };
      } catch {
        return null;
      }
    })
    .filter(
      (
        item,
      ): item is { resultFullTextId: bigint; criteriaId: bigint; result: boolean } =>
        item !== null,
    );

  await prisma.$transaction([
    prisma.resultFullTextCriteria.deleteMany({
      where: {
        resultFullTextId,
      },
    }),
    ...(rows.length > 0
      ? [
        prisma.resultFullTextCriteria.createMany({
          data: rows,
        }),
      ]
      : []),
  ]);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ fullTextId: string }> },
) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { fullTextId: fullTextIdParam } = await params;
  const fullTextId = parseBigIntId(fullTextIdParam);

  if (!fullTextId) {
    return NextResponse.json({ message: "ID full-text tidak valid." }, { status: 400 });
  }

  let body: FullTextScreeningPayload;

  try {
    body = (await request.json()) as FullTextScreeningPayload;
  } catch {
    return NextResponse.json(
      { message: "Payload tidak valid. Gunakan JSON yang benar." },
      { status: 400 },
    );
  }

  const mode = parseMode(body.mode);

  if (!mode) {
    return NextResponse.json({ message: "Mode aksi harus manual atau ai." }, { status: 400 });
  }

  const fullText = await prisma.fullText.findFirst({
    where: {
      id: fullTextId,
      result: {
        hasil: ResultStatus.Included,
        references: {
          userId,
        },
      },
    },
    select: {
      id: true,
      namaFile: true,
      fileMd: true,
      filePdf: true,
      result: {
        select: {
          references: {
            select: {
              id: true,
              citationKey: true,
              entryType: true,
              title: true,
              year: true,
              journal: true,
              publisher: true,
              doi: true,
            },
          },
        },
      },
    },
  });

  if (!fullText) {
    return NextResponse.json(
      { message: "Full-text tidak ditemukan atau bukan milik Anda." },
      { status: 404 },
    );
  }

  if (mode === "manual") {
    const hasil = parseResultStatus(body.hasil);

    if (!hasil) {
      return NextResponse.json(
        { message: "Nilai hasil manual harus Included atau Excluded." },
        { status: 400 },
      );
    }

    const justifikasi = normalizeManualJustification(body.justifikasi, hasil);

    const saved = await upsertResultFullText({
      fullTextId: fullText.id,
      hasil,
      justifikasi,
      ai: "manual/user",
    });

    return NextResponse.json({
      message: "Keputusan manual full-text berhasil disimpan.",
      resultFullTextId: saved.id.toString(),
      hasil: saved.hasil,
    });
  }

  const model = normalizeModel(body.model);

  if (!model) {
    return NextResponse.json(
      {
        message: "Model AI tidak didukung untuk analisa file PDF.",
      },
      { status: 400 },
    );
  }

  const criteriaContext = await getCriteriaContext(userId);
  let aiResult: ParsedFullTextScreeningResult = {
    hasil: ResultStatus.Excluded,
    justifikasi: "File PDF kosong atau tidak dapat dibaca.",
    criteriaAssessments: [],
  };

  const markdownText =
    fullText.fileMd.byteLength > 0 ? decodeMarkdownBytes(fullText.fileMd) : "";

  if (fullText.filePdf.byteLength > 0) {
    try {
      aiResult = await analyzeFullTextWithAi({
        model,
        criteria: criteriaContext,
        fullText: {
          citationKey: fullText.result.references.citationKey,
          entryType: fullText.result.references.entryType,
          title: fullText.result.references.title,
          year: fullText.result.references.year,
          journal: fullText.result.references.journal,
          publisher: fullText.result.references.publisher,
          doi: fullText.result.references.doi,
          markdownText,
          pdfBytes: fullText.filePdf,
          pdfFileName: fullText.namaFile,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown AI analysis error.";
      aiResult = {
        hasil: ResultStatus.Excluded,
        justifikasi: `Gagal analisa AI full-text. Ditandai Excluded. Detail: ${message}`,
        criteriaAssessments: [],
      };
    }
  }

  const saved = await upsertResultFullText({
    fullTextId: fullText.id,
    hasil: aiResult.hasil,
    justifikasi: aiResult.justifikasi,
    ai: model,
  });

  await replaceResultFullTextCriteriaRows({
    resultFullTextId: saved.id,
    criteriaContext,
    assessments: aiResult.criteriaAssessments,
  });

  return NextResponse.json({
    message: "Analisa AI full-text selesai.",
    resultFullTextId: saved.id.toString(),
    hasil: saved.hasil,
  });
}
