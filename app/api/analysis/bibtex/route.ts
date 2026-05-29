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
      nama: true,
      typeCriteriaId: true,
    },
  });

  const inclusionId = inclusionType?.id;
  const exclusionId = exclusionType?.id;

  return {
    inclusionCriteria: criteriaRows
      .filter((item) => (inclusionId ? item.typeCriteriaId === inclusionId : false))
      .map((item) => item.nama),
    exclusionCriteria: criteriaRows
      .filter((item) => (exclusionId ? item.typeCriteriaId === exclusionId : false))
      .map((item) => item.nama),
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
  const criteria = await getCriteriaContext(userId);

  const references = await prisma.bibReference.findMany({
    where: {
      userId,
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

  try {
    for (const reference of references) {
      let hasil: ResultStatus = ResultStatus.Excluded;
      let justifikasi = "Reference tidak dapat dianalisa karena abstract tidak tersedia.";
      let isError = false;

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
        } catch (error) {
          isError = true;
          const message =
            error instanceof Error ? error.message : "Unknown AI analysis error.";
          hasil = ResultStatus.Excluded;
          justifikasi = `Gagal analisa otomatis. Ditandai Excluded. Detail: ${message}`;
        }
      }

      await prisma.result.upsert({
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
      });

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

    if (!job || job.userId !== userId) {
      return NextResponse.json({ message: "Job tidak ditemukan." }, { status: 404 });
    }

    return NextResponse.json({ job: toResponseJob(job) });
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

  const totalReferences = await prisma.bibReference.count({
    where: {
      userId: currentUserId,
    },
  });

  const job = createJob({
    userId,
    model: modelName,
    total: totalReferences,
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
