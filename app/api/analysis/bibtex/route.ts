import { after } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ResultStatus } from "@/generated/prisma/client";
import {
  completeJob,
  createJob,
  failJob,
  getActiveJobForUser,
  getJobById,
  getLatestJobForUser,
  updateJobProgress,
} from "@/lib/ai-analysis-jobs";
import {
  analyzeReferenceWithAi,
  type ScreeningCriteriaContext,
} from "@/lib/ai-screening";
import { isSupportedAiModel, type SupportedAiModel } from "@/lib/ai-models";
import { authOptions } from "@/lib/auth-options";
import { CRITERIA_KIND_CONFIG, matchesCriteriaAlias } from "@/lib/criteria-kind";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type StartAnalysisPayload = {
  model?: string;
};

type AnalysisCounts = {
  totalReferences: number;
  pendingReferences: number;
  includedResultsCount: number;
  excludedResultsCount: number;
};

function normalizeModel(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asUserIdString(value: bigint): string {
  return value.toString();
}

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

function toResponseJob(job: ReturnType<typeof getJobById>) {
  if (!job) {
    return null;
  }

  return {
    jobId: job.id,
    model: job.model,
    status: job.status,
    startProcessed: job.startProcessed ?? 0,
    startIncluded: job.startIncluded ?? 0,
    startExcluded: job.startExcluded ?? 0,
    total: job.total,
    processed: job.processed,
    included: job.included,
    excluded: job.excluded,
    errorCount: job.errorCount,
    errorMessage: job.errorMessage,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
  };
}

async function getAnalysisCounts(userId: bigint): Promise<AnalysisCounts> {
  const [totalReferences, pendingReferences, includedResultsCount, excludedResultsCount] =
    await Promise.all([
      prisma.bibReference.count({
        where: {
          userId,
        },
      }),
      prisma.bibReference.count({
        where: {
          userId,
          result: {
            is: null,
          },
        },
      }),
      prisma.result.count({
        where: {
          hasil: "Included",
          references: {
            userId,
          },
        },
      }),
      prisma.result.count({
        where: {
          hasil: "Excluded",
          references: {
            userId,
          },
        },
      }),
    ]);

  return {
    totalReferences,
    pendingReferences,
    includedResultsCount,
    excludedResultsCount,
  };
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

  const inclusionId = inclusionType?.id;
  const exclusionId = exclusionType?.id;

  return {
    inclusionCriteria: criteriaRows
      .filter((item) => (inclusionId ? item.typeCriteriaId === inclusionId : false))
      .map((item) => ({
        criteriaId: item.id.toString(),
        nama: item.nama,
      })),
    exclusionCriteria: criteriaRows
      .filter((item) => (exclusionId ? item.typeCriteriaId === exclusionId : false))
      .map((item) => ({
        criteriaId: item.id.toString(),
        nama: item.nama,
      })),
  };
}

async function runAnalysisJob({
  jobId,
  userId,
  model,
}: {
  jobId: string;
  userId: bigint;
  model: SupportedAiModel;
}) {
  try {
    const criteria = await getCriteriaContext(userId);
    const allCriteria = [...criteria.inclusionCriteria, ...criteria.exclusionCriteria];

    const references = await prisma.bibReference.findMany({
      where: {
        userId,
        result: {
          is: null,
        },
      },
      orderBy: [{ id: "asc" }],
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

    for (const reference of references) {
      let hasil: ResultStatus = ResultStatus.Excluded;
      let justifikasi = "Reference tidak dapat dianalisa karena abstract tidak tersedia.";
      let isError = false;
      const assessmentMap = new Map<string, boolean>(
        allCriteria.map((item) => [item.criteriaId, false]),
      );

      if (reference.abstract?.trim()) {
        try {
          const parsed = await analyzeReferenceWithAi({
            model,
            criteria,
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

          for (const assessment of parsed.criteriaAssessments) {
            if (!assessmentMap.has(assessment.criteriaId)) {
              continue;
            }

            assessmentMap.set(assessment.criteriaId, assessment.hasil);
          }
        } catch (error) {
          isError = true;
          const message =
            error instanceof Error ? error.message : "Unknown AI analysis error.";
          hasil = ResultStatus.Excluded;
          justifikasi = `Gagal analisa otomatis. Ditandai Excluded. Detail: ${message}`;
        }
      }

      const savedResult = await prisma.result.upsert({
        where: {
          referencesId: reference.id,
        },
        create: {
          referencesId: reference.id,
          hasil,
          justifikasi,
          ai: model,
        },
        update: {
          hasil,
          justifikasi,
          ai: model,
        },
        select: {
          id: true,
        },
      });

      const resultCriteriaRows = allCriteria
        .map((item) => {
          try {
            return {
              resultId: savedResult.id,
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

      if (resultCriteriaRows.length > 0) {
        await prisma.$transaction([
          prisma.resultCriteria.deleteMany({
            where: {
              resultId: savedResult.id,
            },
          }),
          prisma.resultCriteria.createMany({
            data: resultCriteriaRows,
          }),
        ]);
      } else {
        await prisma.resultCriteria.deleteMany({
          where: {
            resultId: savedResult.id,
          },
        });
      }

      updateJobProgress({
        jobId,
        hasil,
        isError,
      });
    }

    completeJob(jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown job error.";
    failJob(jobId, message);
  }
}

export async function GET(request: Request) {
  const currentUserId = await getAuthenticatedUserId();

  if (!currentUserId) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const userId = asUserIdString(currentUserId);
  const url = new URL(request.url);
  const requestedJobId = url.searchParams.get("jobId")?.trim();

  if (requestedJobId) {
    const job = getJobById(requestedJobId);

    if (job && job.userId === userId) {
      return NextResponse.json({ job: toResponseJob(job) });
    }

    const activeJob = getActiveJobForUser(userId);
    const latestJob = getLatestJobForUser(userId);

    if (activeJob || latestJob) {
      return NextResponse.json({
        message:
          "Sesi job sebelumnya tidak ditemukan di server saat ini. Status terbaru digunakan.",
        job: toResponseJob(activeJob ?? latestJob),
      });
    }

    const counts = await getAnalysisCounts(currentUserId);

    return NextResponse.json({
      message:
        counts.pendingReferences > 0
          ? "Sesi analisa sebelumnya berakhir. Klik Analisa untuk melanjutkan references yang belum diproses."
          : "Semua references sudah dianalisa.",
      job: null,
      summary: {
        totalReferences: counts.totalReferences,
        analyzedReferences: Math.max(0, counts.totalReferences - counts.pendingReferences),
        includedResultsCount: counts.includedResultsCount,
        excludedResultsCount: counts.excludedResultsCount,
      },
    });
  }

  const activeJob = getActiveJobForUser(userId);
  const latestJob = getLatestJobForUser(userId);

  return NextResponse.json({
    job: toResponseJob(activeJob ?? latestJob),
  });
}

export async function POST(request: Request) {
  const currentUserId = await getAuthenticatedUserId();

  if (!currentUserId) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const userId = asUserIdString(currentUserId);
  const existingActiveJob = getActiveJobForUser(userId);

  if (existingActiveJob?.status === "running") {
    return NextResponse.json(
      {
        message: "Analisa sedang berjalan.",
        job: toResponseJob(existingActiveJob),
      },
      { status: 409 },
    );
  }

  let body: StartAnalysisPayload | null = null;
  try {
    body = (await request.json()) as StartAnalysisPayload;
  } catch {
    body = null;
  }

  const modelName = normalizeModel(body?.model);

  if (!isSupportedAiModel(modelName)) {
    return NextResponse.json(
      {
        message: "Model AI tidak didukung.",
      },
      { status: 400 },
    );
  }

  const { totalReferences, pendingReferences, includedResultsCount, excludedResultsCount } =
    await getAnalysisCounts(currentUserId);

  const analyzedReferences = Math.max(0, totalReferences - pendingReferences);

  const job = createJob({
    userId,
    model: modelName,
    startProcessed: analyzedReferences,
    startIncluded: includedResultsCount,
    startExcluded: excludedResultsCount,
    total: pendingReferences,
  });

  after(async () => {
    await runAnalysisJob({
      jobId: job.id,
      userId: currentUserId,
      model: modelName,
    });
  });

  return NextResponse.json(
    {
      message: "Analisa dimulai.",
      job: toResponseJob(job),
    },
    { status: 202 },
  );
}
