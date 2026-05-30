import { after } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ResultStatus } from "@/generated/prisma/client";
import {
  analyzeFullTextWithAi,
  type ParsedFullTextScreeningResult,
} from "@/lib/ai-fulltext-screening";
import { type PdfCapableAiModel, isPdfCapableAiModel } from "@/lib/ai-models";
import { authOptions } from "@/lib/auth-options";
import {
  completeJob,
  createJob,
  failJob,
  getActiveJobForUser,
  getJobById,
  getLatestJobForUser,
  markStopped,
  requestStopJob,
  updateJobProgress,
} from "@/lib/full-text-analysis-jobs";
import { type ParsedCriterionAssessment, type ScreeningCriteriaContext } from "@/lib/ai-screening";
import { CRITERIA_KIND_CONFIG, matchesCriteriaAlias } from "@/lib/criteria-kind";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type StartAnalysisPayload = {
  model?: string;
};

type StopAnalysisPayload = {
  jobId?: string;
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

function decodeMarkdownBytes(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function mapAssessmentsById(items: ParsedCriterionAssessment[]): Map<string, boolean> {
  return new Map(items.map((item) => [item.criteriaId, item.hasil]));
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
    stopRequested: job.stopRequested,
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
  };
}

async function getAnalysisCounts(userId: bigint): Promise<AnalysisCounts> {
  const whereBase = {
    result: {
      hasil: ResultStatus.Included,
      references: {
        userId,
      },
    },
  };

  const [totalReferences, pendingReferences, includedResultsCount, excludedResultsCount] =
    await Promise.all([
      prisma.fullText.count({
        where: whereBase,
      }),
      prisma.fullText.count({
        where: {
          ...whereBase,
          resultFullText: {
            none: {},
          },
        },
      }),
      prisma.resultFullText.count({
        where: {
          hasil: ResultStatus.Included,
          fullText: {
            result: {
              references: {
                userId,
              },
            },
          },
        },
      }),
      prisma.resultFullText.count({
        where: {
          hasil: ResultStatus.Excluded,
          fullText: {
            result: {
              references: {
                userId,
              },
            },
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

async function runAnalysisJob({
  jobId,
  userId,
  model,
}: {
  jobId: string;
  userId: bigint;
  model: PdfCapableAiModel;
}) {
  try {
    const criteriaContext = await getCriteriaContext(userId);

    const fullTexts = await prisma.fullText.findMany({
      where: {
        result: {
          hasil: ResultStatus.Included,
          references: {
            userId,
          },
        },
        resultFullText: {
          none: {},
        },
      },
      orderBy: [{ id: "asc" }],
      select: {
        id: true,
        namaFile: true,
        fileMd: true,
        filePdf: true,
        result: {
          select: {
            references: {
              select: {
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

    for (const fullText of fullTexts) {
      const latestJob = getJobById(jobId);

      if (!latestJob || latestJob.status !== "running") {
        return;
      }

      if (latestJob.stopRequested) {
        markStopped(jobId);
        return;
      }

      let aiResult: ParsedFullTextScreeningResult = {
        hasil: ResultStatus.Excluded,
        justifikasi: "File PDF kosong atau tidak dapat dibaca.",
        criteriaAssessments: [],
      };
      let isError = false;
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
          isError = true;
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

      updateJobProgress({
        jobId,
        hasil: aiResult.hasil,
        isError,
      });
    }

    const latestJob = getJobById(jobId);

    if (!latestJob || latestJob.status !== "running") {
      return;
    }

    if (latestJob.stopRequested) {
      markStopped(jobId);
      return;
    }

    completeJob(jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown full-text job error.";
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
  const counts = await getAnalysisCounts(currentUserId);
  const summary = {
    totalReferences: counts.totalReferences,
    analyzedReferences: Math.max(0, counts.totalReferences - counts.pendingReferences),
    includedResultsCount: counts.includedResultsCount,
    excludedResultsCount: counts.excludedResultsCount,
  };

  if (requestedJobId) {
    const job = getJobById(requestedJobId);

    if (job && job.userId === userId) {
      return NextResponse.json({ job: toResponseJob(job), summary });
    }

    const activeJob = getActiveJobForUser(userId);
    const latestJob = getLatestJobForUser(userId);

    if (activeJob || latestJob) {
      return NextResponse.json({
        message:
          "Sesi job sebelumnya tidak ditemukan di server saat ini. Status terbaru digunakan.",
        job: toResponseJob(activeJob ?? latestJob),
        summary,
      });
    }

    return NextResponse.json({
      message:
        counts.pendingReferences > 0
          ? "Sesi analisa full-text sebelumnya berakhir. Klik Lanjutkan untuk memproses sisa data."
          : "Semua full-text sudah dianalisa.",
      job: null,
      summary,
    });
  }

  const activeJob = getActiveJobForUser(userId);
  const latestJob = getLatestJobForUser(userId);

  return NextResponse.json({
    job: toResponseJob(activeJob ?? latestJob),
    summary,
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
    const counts = await getAnalysisCounts(currentUserId);

    return NextResponse.json(
      {
        message: "Analisa full-text sedang berjalan.",
        job: toResponseJob(existingActiveJob),
        summary: {
          totalReferences: counts.totalReferences,
          analyzedReferences: Math.max(0, counts.totalReferences - counts.pendingReferences),
          includedResultsCount: counts.includedResultsCount,
          excludedResultsCount: counts.excludedResultsCount,
        },
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

  if (!isPdfCapableAiModel(modelName)) {
    return NextResponse.json(
      {
        message: "Model AI tidak didukung untuk analisa file PDF.",
      },
      { status: 400 },
    );
  }

  const { totalReferences, pendingReferences, includedResultsCount, excludedResultsCount } =
    await getAnalysisCounts(currentUserId);

  if (totalReferences === 0) {
    return NextResponse.json(
      {
        message: "Belum ada full-text PDF untuk dianalisa.",
        job: null,
        summary: {
          totalReferences,
          analyzedReferences: 0,
          includedResultsCount,
          excludedResultsCount,
        },
      },
      { status: 409 },
    );
  }

  if (pendingReferences <= 0) {
    return NextResponse.json(
      {
        message: "Semua full-text sudah dianalisa.",
        job: null,
        summary: {
          totalReferences,
          analyzedReferences: totalReferences,
          includedResultsCount,
          excludedResultsCount,
        },
      },
      { status: 409 },
    );
  }

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
      message: "Analisa full-text dimulai.",
      job: toResponseJob(job),
      summary: {
        totalReferences,
        analyzedReferences,
        includedResultsCount,
        excludedResultsCount,
      },
    },
    { status: 202 },
  );
}

export async function DELETE(request: Request) {
  const currentUserId = await getAuthenticatedUserId();

  if (!currentUserId) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const userId = asUserIdString(currentUserId);
  let payload: StopAnalysisPayload | null = null;

  try {
    payload = (await request.json()) as StopAnalysisPayload;
  } catch {
    payload = null;
  }

  const requestedJobId = typeof payload?.jobId === "string" ? payload.jobId.trim() : "";
  const targetJob = requestedJobId
    ? getJobById(requestedJobId)
    : getActiveJobForUser(userId);

  if (!targetJob || targetJob.userId !== userId) {
    return NextResponse.json(
      {
        message: "Job aktif tidak ditemukan.",
      },
      { status: 404 },
    );
  }

  if (targetJob.status !== "running") {
    return NextResponse.json(
      {
        message: "Job tidak sedang berjalan.",
        job: toResponseJob(targetJob),
      },
      { status: 409 },
    );
  }

  const updatedJob = requestStopJob({
    jobId: targetJob.id,
    userId,
  });

  const counts = await getAnalysisCounts(currentUserId);

  return NextResponse.json({
    message: "Permintaan stop diterima. Sistem akan berhenti setelah proses item saat ini selesai.",
    job: toResponseJob(updatedJob ?? targetJob),
    summary: {
      totalReferences: counts.totalReferences,
      analyzedReferences: Math.max(0, counts.totalReferences - counts.pendingReferences),
      includedResultsCount: counts.includedResultsCount,
      excludedResultsCount: counts.excludedResultsCount,
    },
  });
}
