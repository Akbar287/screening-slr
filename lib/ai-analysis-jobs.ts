import type { ResultStatus } from "@/generated/prisma/client";
import type { SupportedAiModel } from "@/lib/ai-models";

export type AnalysisJobStatus = "running" | "completed" | "failed";

export type BibtexAnalysisJob = {
  id: string;
  userId: string;
  model: SupportedAiModel;
  status: AnalysisJobStatus;
  startProcessed: number;
  startIncluded: number;
  startExcluded: number;
  total: number;
  processed: number;
  included: number;
  excluded: number;
  errorCount: number;
  errorMessage: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
};

type InternalStore = {
  byId: Map<string, BibtexAnalysisJob>;
  activeByUserId: Map<string, string>;
  latestByUserId: Map<string, string>;
};

declare global {
  var __bibtexAnalysisStore: InternalStore | undefined;
}

function getStore(): InternalStore {
  if (!globalThis.__bibtexAnalysisStore) {
    globalThis.__bibtexAnalysisStore = {
      byId: new Map<string, BibtexAnalysisJob>(),
      activeByUserId: new Map<string, string>(),
      latestByUserId: new Map<string, string>(),
    };
  }

  return globalThis.__bibtexAnalysisStore;
}

function nowIso(): string {
  return new Date().toISOString();
}

function cloneJob(job: BibtexAnalysisJob): BibtexAnalysisJob {
  return {
    ...job,
  };
}

export function getJobById(jobId: string): BibtexAnalysisJob | null {
  const job = getStore().byId.get(jobId);
  return job ? cloneJob(job) : null;
}

export function getActiveJobForUser(userId: string): BibtexAnalysisJob | null {
  const store = getStore();
  const activeJobId = store.activeByUserId.get(userId);

  if (!activeJobId) {
    return null;
  }

  const job = store.byId.get(activeJobId);
  if (!job) {
    store.activeByUserId.delete(userId);
    return null;
  }

  return cloneJob(job);
}

export function getLatestJobForUser(userId: string): BibtexAnalysisJob | null {
  const store = getStore();
  const latestJobId = store.latestByUserId.get(userId);

  if (!latestJobId) {
    return null;
  }

  const job = store.byId.get(latestJobId);
  return job ? cloneJob(job) : null;
}

export function createJob({
  userId,
  model,
  startProcessed,
  startIncluded,
  startExcluded,
  total,
}: {
  userId: string;
  model: SupportedAiModel;
  startProcessed: number;
  startIncluded: number;
  startExcluded: number;
  total: number;
}): BibtexAnalysisJob {
  const store = getStore();
  const now = nowIso();
  const randomPart = Math.random().toString(36).slice(2, 10);
  const jobId = `job_${Date.now()}_${randomPart}`;

  const job: BibtexAnalysisJob = {
    id: jobId,
    userId,
    model,
    status: "running",
    startProcessed: Math.max(0, startProcessed),
    startIncluded: Math.max(0, startIncluded),
    startExcluded: Math.max(0, startExcluded),
    total,
    processed: 0,
    included: 0,
    excluded: 0,
    errorCount: 0,
    errorMessage: null,
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
  };

  store.byId.set(jobId, job);
  store.activeByUserId.set(userId, jobId);
  store.latestByUserId.set(userId, jobId);

  return cloneJob(job);
}

export function updateJobProgress({
  jobId,
  hasil,
  isError,
}: {
  jobId: string;
  hasil: ResultStatus;
  isError?: boolean;
}): BibtexAnalysisJob | null {
  const store = getStore();
  const current = store.byId.get(jobId);

  if (!current || current.status !== "running") {
    return current ? cloneJob(current) : null;
  }

  current.processed += 1;

  if (hasil === "Included") {
    current.included += 1;
  } else {
    current.excluded += 1;
  }

  if (isError) {
    current.errorCount += 1;
  }

  current.updatedAt = nowIso();
  return cloneJob(current);
}

export function completeJob(jobId: string): BibtexAnalysisJob | null {
  const store = getStore();
  const current = store.byId.get(jobId);

  if (!current) {
    return null;
  }

  current.status = "completed";
  current.finishedAt = nowIso();
  current.updatedAt = current.finishedAt;

  const activeJobId = store.activeByUserId.get(current.userId);
  if (activeJobId === jobId) {
    store.activeByUserId.delete(current.userId);
  }

  return cloneJob(current);
}

export function failJob(jobId: string, errorMessage: string): BibtexAnalysisJob | null {
  const store = getStore();
  const current = store.byId.get(jobId);

  if (!current) {
    return null;
  }

  current.status = "failed";
  current.errorMessage = errorMessage;
  current.finishedAt = nowIso();
  current.updatedAt = current.finishedAt;

  const activeJobId = store.activeByUserId.get(current.userId);
  if (activeJobId === jobId) {
    store.activeByUserId.delete(current.userId);
  }

  return cloneJob(current);
}
