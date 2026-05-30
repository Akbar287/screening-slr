import { getServerSession } from "next-auth";
import { ResultStatus } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { isSupportedAiModel } from "@/lib/ai-models";
import {
  analyzeReferenceWithAi,
  type ParsedCriterionAssessment,
  type ScreeningCriteriaContext,
} from "@/lib/ai-screening";
import { CRITERIA_KIND_CONFIG, matchesCriteriaAlias } from "@/lib/criteria-kind";
import { prisma } from "@/lib/prisma";

type ScreeningActionPayload = {
  mode?: unknown;
  hasil?: unknown;
  model?: unknown;
  justifikasi?: unknown;
};

type ScreeningActionMode = "manual" | "ai";

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

function parseReferenceId(value: string): bigint | null {
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

function parseMode(value: unknown): ScreeningActionMode | null {
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

function normalizeModel(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeManualJustification(value: unknown, fallbackHasil: ResultStatus): string {
  const candidate = typeof value === "string" ? value.trim() : "";

  if (candidate.length > 0) {
    return candidate;
  }

  return fallbackHasil === ResultStatus.Included
    ? "Dipilih Included secara manual oleh user."
    : "Dipilih Excluded secara manual oleh user.";
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

function mapAssessmentsById(items: ParsedCriterionAssessment[]): Map<string, boolean> {
  return new Map(items.map((item) => [item.criteriaId, item.hasil]));
}

async function replaceResultCriteriaRows({
  resultId,
  criteriaContext,
  assessments,
}: {
  resultId: bigint;
  criteriaContext: ScreeningCriteriaContext;
  assessments: ParsedCriterionAssessment[];
}) {
  const mergedCriteria = [
    ...criteriaContext.inclusionCriteria,
    ...criteriaContext.exclusionCriteria,
  ];

  if (mergedCriteria.length === 0) {
    await prisma.resultCriteria.deleteMany({
      where: {
        resultId,
      },
    });
    return;
  }

  const assessmentMap = mapAssessmentsById(assessments);

  const rows = mergedCriteria
    .map((item) => {
      try {
        return {
          resultId,
          criteriaId: BigInt(item.criteriaId),
          hasil: assessmentMap.get(item.criteriaId) === true,
        };
      } catch {
        return null;
      }
    })
    .filter((item): item is { resultId: bigint; criteriaId: bigint; hasil: boolean } =>
      item !== null,
    );

  await prisma.$transaction([
    prisma.resultCriteria.deleteMany({
      where: {
        resultId,
      },
    }),
    ...(rows.length > 0
      ? [
        prisma.resultCriteria.createMany({
          data: rows,
        }),
      ]
      : []),
  ]);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ referenceId: string }> },
) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { referenceId: referenceIdParam } = await params;
  const referenceId = parseReferenceId(referenceIdParam);

  if (!referenceId) {
    return NextResponse.json({ message: "ID reference tidak valid." }, { status: 400 });
  }

  let body: ScreeningActionPayload;

  try {
    body = (await request.json()) as ScreeningActionPayload;
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

  const reference = await prisma.bibReference.findFirst({
    where: {
      id: referenceId,
      userId,
    },
    select: {
      id: true,
      citationKey: true,
      entryType: true,
      title: true,
      abstract: true,
      year: true,
      journal: true,
      publisher: true,
    },
  });

  if (!reference) {
    return NextResponse.json({ message: "Reference tidak ditemukan." }, { status: 404 });
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

    const saved = await prisma.result.upsert({
      where: {
        referencesId: reference.id,
      },
      create: {
        referencesId: reference.id,
        hasil,
        justifikasi,
        ai: "manual/user",
      },
      update: {
        hasil,
        justifikasi,
        ai: "manual/user",
      },
      select: {
        id: true,
        hasil: true,
      },
    });

    return NextResponse.json({
      message: "Keputusan manual berhasil disimpan.",
      resultId: saved.id.toString(),
      hasil: saved.hasil,
    });
  }

  const modelName = normalizeModel(body.model);

  if (!isSupportedAiModel(modelName)) {
    return NextResponse.json(
      {
        message: "Model AI tidak didukung.",
      },
      { status: 400 },
    );
  }

  const criteriaContext = await getCriteriaContext(userId);

  let hasil: ResultStatus = ResultStatus.Excluded;
  let justifikasi = "Reference tidak dapat dianalisa karena abstract tidak tersedia.";
  let criteriaAssessments: ParsedCriterionAssessment[] = [];

  if (reference.abstract?.trim()) {
    try {
      const parsed = await analyzeReferenceWithAi({
        model: modelName,
        criteria: criteriaContext,
        reference: {
          citationKey: reference.citationKey,
          entryType: reference.entryType,
          title: reference.title,
          abstract: reference.abstract,
          year: reference.year,
          journal: reference.journal,
          publisher: reference.publisher,
        },
      });

      hasil = parsed.hasil;
      justifikasi = parsed.justifikasi;
      criteriaAssessments = parsed.criteriaAssessments;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown AI analysis error.";
      hasil = ResultStatus.Excluded;
      justifikasi = `Gagal analisa AI untuk reference ini. Ditandai Excluded. Detail: ${message}`;
      criteriaAssessments = [];
    }
  }

  const saved = await prisma.result.upsert({
    where: {
      referencesId: reference.id,
    },
    create: {
      referencesId: reference.id,
      hasil,
      justifikasi,
      ai: modelName,
    },
    update: {
      hasil,
      justifikasi,
      ai: modelName,
    },
    select: {
      id: true,
      hasil: true,
    },
  });

  await replaceResultCriteriaRows({
    resultId: saved.id,
    criteriaContext,
    assessments: criteriaAssessments,
  });

  return NextResponse.json({
    message: "Analisa AI per reference selesai.",
    resultId: saved.id.toString(),
    hasil: saved.hasil,
  });
}
