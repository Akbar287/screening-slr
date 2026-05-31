"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupportedAiModel } from "@/lib/ai-models";
import { cn } from "@/lib/utils";

type JobStatus = "running" | "completed" | "failed";

type AnalysisJobPayload = {
  jobId: string;
  model: SupportedAiModel;
  status: JobStatus;
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

type AnalysisApiResponse = {
  message?: string;
  job: AnalysisJobPayload | null;
  summary?: {
    totalReferences: number;
    analyzedReferences: number;
    includedResultsCount: number;
    excludedResultsCount: number;
  };
};

type BibtexAiAnalysisCardProps = {
  models: SupportedAiModel[];
  defaultModel: SupportedAiModel;
  totalReferences: number;
  analyzedReferences: number;
  includedResultsCount: number;
  excludedResultsCount: number;
};

function statusLabel(status: JobStatus): string {
  if (status === "running") {
    return "Sedang Berjalan";
  }

  if (status === "completed") {
    return "Selesai";
  }

  return "Gagal";
}

function statusClassName(status: JobStatus): string {
  if (status === "running") {
    return "border-cyan-300/70 bg-cyan-100 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-200";
  }

  if (status === "completed") {
    return "border-emerald-300/70 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200";
  }

  return "border-rose-300/70 bg-rose-100 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200";
}

export function BibtexAiAnalysisCard({
  models,
  defaultModel,
  totalReferences,
  analyzedReferences,
  includedResultsCount,
  excludedResultsCount,
}: BibtexAiAnalysisCardProps) {
  const [selectedModel, setSelectedModel] = useState<SupportedAiModel>(defaultModel);
  const [job, setJob] = useState<AnalysisJobPayload | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [snapshot, setSnapshot] = useState(() => ({
    totalReferences,
    analyzedReferences,
    includedResultsCount,
    excludedResultsCount,
  }));

  const applySummary = useCallback((summary?: AnalysisApiResponse["summary"]) => {
    if (!summary) {
      return;
    }

    setSnapshot({
      totalReferences: Math.max(0, summary.totalReferences),
      analyzedReferences: Math.max(0, summary.analyzedReferences),
      includedResultsCount: Math.max(0, summary.includedResultsCount),
      excludedResultsCount: Math.max(0, summary.excludedResultsCount),
    });
  }, []);

  const refreshCurrentJob = useCallback(async () => {
    const response = await fetch("/api/analysis/bibtex", {
      method: "GET",
      cache: "no-store",
    });

    const data = (await response.json()) as AnalysisApiResponse;
    if (!response.ok) {
      throw new Error(data.message || "Gagal mengambil status analisa.");
    }

    applySummary(data.summary);

    if (data.job) {
      setJob(data.job);
      setSelectedModel(data.job.model);
      setErrorMessage("");
      return;
    }

    setJob(null);

    if (data.message) {
      setErrorMessage(data.message);
    }
  }, [applySummary]);

  const pollJobStatus = useCallback(async (jobId: string) => {
    const response = await fetch(`/api/analysis/bibtex?jobId=${encodeURIComponent(jobId)}`, {
      method: "GET",
      cache: "no-store",
    });

    const data = (await response.json()) as AnalysisApiResponse;
    if (!response.ok) {
      if (response.status === 404) {
        await refreshCurrentJob();
        return;
      }

      throw new Error(data.message || "Gagal mengambil status analisa.");
    }

    applySummary(data.summary);

    if (data.job) {
      setJob(data.job);
      setErrorMessage("");
      return;
    }

    setJob(null);

    if (data.message) {
      setErrorMessage(data.message);
    }
  }, [applySummary, refreshCurrentJob]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void refreshCurrentJob().catch(() => {
        // Initial status request is best-effort.
      });
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [refreshCurrentJob]);

  useEffect(() => {
    if (!job || job.status !== "running") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void pollJobStatus(job.jobId).catch((error) => {
        const message =
          error instanceof Error ? error.message : "Gagal update progress analisa.";
        setErrorMessage(message);
      });
    }, 1200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [job, pollJobStatus]);

  async function startAnalysis() {
    setIsStarting(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/analysis/bibtex", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
        }),
      });

      const data = (await response.json()) as AnalysisApiResponse;
      if (!response.ok) {
        if (data.job) {
          setJob(data.job);
        }

        throw new Error(data.message || "Gagal memulai analisa.");
      }

      applySummary(data.summary);

      if (data.job) {
        setJob(data.job);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal memulai analisa AI.";
      setErrorMessage(message);
    } finally {
      setIsStarting(false);
    }
  }

  const isRunning = job?.status === "running";
  const totalReferencesForDisplay = snapshot.totalReferences;
  const analyzedFromSnapshot = Math.max(
    0,
    Math.min(totalReferencesForDisplay, snapshot.analyzedReferences),
  );
  const jobStartProcessed = job?.startProcessed ?? analyzedFromSnapshot;
  const analyzedCountForDisplay = job
    ? Math.max(
      0,
      Math.min(totalReferencesForDisplay, jobStartProcessed + job.processed),
    )
    : analyzedFromSnapshot;
  const includedCount = job
    ? Math.max(
      0,
      Math.min(
        totalReferencesForDisplay,
        (job.startIncluded ?? snapshot.includedResultsCount) + job.included,
      ),
    )
    : snapshot.includedResultsCount;
  const excludedCount = job
    ? Math.max(
      0,
      Math.min(
        totalReferencesForDisplay,
        (job.startExcluded ?? snapshot.excludedResultsCount) + job.excluded,
      ),
    )
    : snapshot.excludedResultsCount;
  const pendingCountForDisplay = Math.max(
    0,
    totalReferencesForDisplay - analyzedCountForDisplay,
  );
  const progress = useMemo(() => {
    if (totalReferencesForDisplay <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((analyzedCountForDisplay / totalReferencesForDisplay) * 100));
  }, [analyzedCountForDisplay, totalReferencesForDisplay]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-primary" />
              Analisa Abstrak & Judul dengan AI
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Screening otomatis semua references berdasarkan Abstrak & Judul untuk memenuhi inclusion dan exclusion criteria.
            </p>
          </div>

          {job ? (
            <Badge variant="outline" className={cn("border", statusClassName(job.status))}>
              {statusLabel(job.status)}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-zinc-300/70">
              Siap
            </Badge>
          )}
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Pilih Model AI</span>
              <select
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value as SupportedAiModel)}
                disabled={isRunning || isStarting}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
              >
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <Button
                type="button"
                onClick={() => void startAnalysis()}
                disabled={isRunning || isStarting || totalReferencesForDisplay === 0}
                className="h-10 min-w-32"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Memulai...
                  </>
                ) : isRunning ? (
                  "Sedang Analisa"
                ) : (
                  "Analisa"
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">Total: {totalReferencesForDisplay}</Badge>
              <Badge
                variant="outline"
                className="border-emerald-300/70 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300"
              >
                Sudah dianalisa: {analyzedCountForDisplay}
              </Badge>
              <Badge
                variant="outline"
                className="border-amber-300/70 text-amber-700 dark:border-amber-500/40 dark:text-amber-300"
              >
                Belum dianalisa: {pendingCountForDisplay}
              </Badge>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Progress</span>
              <span className="text-muted-foreground">
                {analyzedCountForDisplay}/{totalReferencesForDisplay}
              </span>
            </div>

            <div className="relative h-3 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800/80">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-cyan-500 via-emerald-500 to-lime-500"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
              <motion.div
                className="absolute inset-y-0 w-24 bg-white/30 mix-blend-soft-light"
                animate={{ x: ["-120%", "420%"] }}
                transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.8, ease: "linear" }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">{progress}%</Badge>
              <Badge variant="outline" className="border-emerald-300/70 text-emerald-700 dark:border-emerald-500/40 dark:text-emerald-300">
                Included: {includedCount}
              </Badge>
              <Badge variant="outline" className="border-rose-300/70 text-rose-700 dark:border-rose-500/40 dark:text-rose-300">
                Excluded: {excludedCount}
              </Badge>
              {job?.errorCount ? (
                <Badge variant="outline" className="border-amber-300/70 text-amber-700 dark:border-amber-500/40 dark:text-amber-300">
                  Error: {job.errorCount}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {includedCount > 0 ? (
              <Button asChild variant="outline">
                <a href="/api/analysis/bibtex/download?status=Included">
                  Unduh Included (.bib)
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled>
                Unduh Included (.bib)
              </Button>
            )}

            {excludedCount > 0 ? (
              <Button asChild variant="outline">
                <a href="/api/analysis/bibtex/download?status=Excluded">
                  Unduh Excluded (.bib)
                </a>
              </Button>
            ) : (
              <Button type="button" variant="outline" disabled>
                Unduh Excluded (.bib)
              </Button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button asChild variant="secondary">
              <Link href="/analysis-results">Lihat Hasil Analisa</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/screening">Screening Interaktif</Link>
            </Button>
          </div>

          <AnimatePresence initial={false}>
            {errorMessage ? (
              <motion.p
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="rounded-lg border border-rose-300/70 bg-rose-100/70 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-200"
              >
                {errorMessage}
              </motion.p>
            ) : null}
          </AnimatePresence>

          {totalReferencesForDisplay === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              Belum ada data references untuk dianalisa.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </motion.section>
  );
}
