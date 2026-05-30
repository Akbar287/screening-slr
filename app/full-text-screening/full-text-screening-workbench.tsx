"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Check, FileText, Loader2, Search, X, XCircle } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { type PdfCapableAiModel } from "@/lib/ai-models";
import { buildPaginationItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";

type FullTextFilter = "undecided" | "included" | "excluded" | "all";

export type FullTextScreeningRow = {
  fullTextId: string;
  resultId: string;
  referenceId: string;
  citationKey: string;
  entryType: string;
  title: string | null;
  year: number | null;
  journal: string | null;
  publisher: string | null;
  doi: string | null;
  namaFile: string;
  updatedAt: string;
  markdownPreview: string;
  resultFullText: {
    id: string;
    hasil: "Included" | "Excluded";
    justifikasi: string;
    ai: string;
    resultCriteria: {
      id: string;
      nama: string;
      typeNama: string;
      hasil: boolean;
    }[];
  } | null;
};

type FullTextScreeningWorkbenchProps = {
  rows: FullTextScreeningRow[];
  totalRows: number;
  undecidedCount: number;
  includedCount: number;
  excludedCount: number;
  filteredTotalRows: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  selectedFullTextId: string | null;
  activeFilter: FullTextFilter;
  models: PdfCapableAiModel[];
  defaultModel: PdfCapableAiModel;
};

type FullTextScreeningActionBody =
  | {
    mode: "manual";
    hasil: "Included" | "Excluded";
    justifikasi: string;
  }
  | {
    mode: "ai";
    model: PdfCapableAiModel;
  };

function optionalText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : "-";
}

function resultBadgeClass(hasil: "Included" | "Excluded" | "Undecided"): string {
  if (hasil === "Included") {
    return "border-emerald-300/70 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200";
  }

  if (hasil === "Excluded") {
    return "border-rose-300/70 bg-rose-100 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200";
  }

  return "border-cyan-300/70 bg-cyan-100 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-200";
}

function resolveCriteriaKind(typeName: string): "inclusion" | "exclusion" | "other" {
  const normalized = typeName.trim().toLowerCase();

  if (normalized.includes("inclusion") || normalized.includes("iclusion")) {
    return "inclusion";
  }

  if (normalized.includes("exclusion")) {
    return "exclusion";
  }

  return "other";
}

function criteriaCardClass(typeName: string): string {
  const kind = resolveCriteriaKind(typeName);

  if (kind === "inclusion") {
    return "border-emerald-300/60 bg-emerald-100/60 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200";
  }

  if (kind === "exclusion") {
    return "border-amber-300/60 bg-amber-100/60 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200";
  }

  return "border-zinc-300/60 bg-zinc-100/60 text-zinc-900 dark:border-zinc-500/40 dark:bg-zinc-500/10 dark:text-zinc-200";
}

function statusOf(row: FullTextScreeningRow): "Included" | "Excluded" | "Undecided" {
  return row.resultFullText?.hasil ?? "Undecided";
}

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown };

    if (typeof payload.message === "string" && payload.message.trim().length > 0) {
      return payload.message.trim();
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
}

export function FullTextScreeningWorkbench({
  rows,
  totalRows,
  undecidedCount,
  includedCount,
  excludedCount,
  filteredTotalRows,
  currentPage,
  totalPages,
  pageSize,
  selectedFullTextId,
  activeFilter,
  models,
  defaultModel,
}: FullTextScreeningWorkbenchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedModel, setSelectedModel] = useState<PdfCapableAiModel>(defaultModel);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  const paginationItems = useMemo(
    () => buildPaginationItems({
      currentPage,
      totalPages,
      siblingCount: 1,
    }),
    [currentPage, totalPages],
  );

  const selectedRow = useMemo(
    () => rows.find((item) => item.fullTextId === selectedFullTextId) ?? null,
    [rows, selectedFullTextId],
  );
  const selectedPdfUrl = useMemo(() => {
    if (!selectedRow) {
      return "";
    }

    const version = encodeURIComponent(selectedRow.updatedAt);
    return `/api/full-text/pdf/${encodeURIComponent(selectedRow.fullTextId)}?v=${version}`;
  }, [selectedRow]);

  const showingCount = rows.length;
  const pageStart = filteredTotalRows > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const pageEnd = filteredTotalRows > 0 ? pageStart + showingCount - 1 : 0;

  function buildHref(next: { filter?: FullTextFilter; fullTextId?: string | null; page?: number }): string {
    const params = new URLSearchParams(searchParams.toString());
    const nextFilter = next.filter ?? activeFilter;
    const nextPage = Math.max(1, next.page ?? currentPage);

    params.set("status", nextFilter);
    params.set("page", String(nextPage));

    if (typeof next.fullTextId === "string" && next.fullTextId.length > 0) {
      params.set("fullTextId", next.fullTextId);
    } else {
      params.delete("fullTextId");
    }

    return `${pathname}?${params.toString()}`;
  }

  function onChangeFilter(nextFilter: FullTextFilter) {
    router.push(buildHref({ filter: nextFilter, page: 1, fullTextId: null }));
  }

  function onSelectRow(fullTextId: string) {
    router.push(buildHref({ page: currentPage, fullTextId }));
  }

  function goToPage(nextPage: number) {
    const clampedPage = Math.min(Math.max(1, nextPage), totalPages);
    router.push(buildHref({ page: clampedPage, fullTextId: null }));
  }

  async function submitDecision(payload: FullTextScreeningActionBody) {
    if (!selectedRow) {
      return;
    }

    setActionError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/full-text/screening/${selectedRow.fullTextId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Gagal menyimpan keputusan full-text screening.",
        );
        setActionError(message);
        return;
      }

      router.refresh();
    } catch {
      setActionError("Terjadi gangguan jaringan saat menyimpan keputusan.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      className="space-y-4"
    >
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardContent className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Search className="h-4 w-4" />
                <span>Filter List</span>
              </div>
              <select
                value={activeFilter}
                onChange={(event) => onChangeFilter(event.target.value as FullTextFilter)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="undecided">Undecided</option>
                <option value="included">Included</option>
                <option value="excluded">Excluded</option>
                <option value="all">All</option>
              </select>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-lg border border-border/70 bg-muted/40 p-2"
            >
              <p className="text-xs text-muted-foreground">
                Menampilkan {pageStart.toLocaleString("id-ID")}-{pageEnd.toLocaleString("id-ID")} dari {filteredTotalRows.toLocaleString("id-ID")} data
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[11px]">Total: {totalRows}</Badge>
                <Badge variant="outline" className="text-[11px]">Undecided: {undecidedCount}</Badge>
                <Badge variant="outline" className="text-[11px]">Included: {includedCount}</Badge>
                <Badge variant="outline" className="text-[11px]">Excluded: {excludedCount}</Badge>
              </div>
            </motion.div>

            <div className="max-h-[64vh] space-y-2 overflow-auto pr-1">
              {rows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Tidak ada full-text pada filter ini.
                </div>
              ) : (
                rows.map((row, index) => {
                  const status = statusOf(row);
                  const isSelected = selectedRow?.fullTextId === row.fullTextId;
                  const absoluteIndex = (currentPage - 1) * pageSize + index + 1;

                  return (
                    <button
                      key={row.fullTextId}
                      type="button"
                      onClick={() => onSelectRow(row.fullTextId)}
                      className={cn(
                        "w-full rounded-xl border p-3 text-left transition",
                        isSelected
                          ? "border-cyan-400/70 bg-cyan-100/70 dark:border-cyan-500/50 dark:bg-cyan-500/10"
                          : "border-border/70 bg-background/70 hover:bg-muted/60",
                      )}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">#{absoluteIndex}</span>
                        <Badge variant="outline" className={resultBadgeClass(status)}>
                          {status}
                        </Badge>
                      </div>
                      <p className="line-clamp-2 text-base font-semibold">
                        {optionalText(row.title)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {optionalText(row.year)} | {row.citationKey}
                      </p>
                      <p className="line-clamp-1 text-sm text-muted-foreground">
                        File: {row.namaFile}
                      </p>
                    </button>
                  );
                })
              )}
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                Halaman {currentPage} dari {totalPages}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(1)}
                  disabled={currentPage <= 1}
                >
                  Paling awal
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage <= 1}
                >
                  Sebelumnya
                </Button>

                {paginationItems.map((item, index) =>
                  item === "ellipsis" ? (
                    <span
                      key={`fulltext-ellipsis-${index}`}
                      className="px-1 text-sm text-muted-foreground"
                    >
                      ...
                    </span>
                  ) : (
                    <Button
                      key={`fulltext-page-${item}`}
                      type="button"
                      variant={item === currentPage ? "default" : "outline"}
                      size="sm"
                      className="min-w-9"
                      onClick={() => goToPage(item)}
                    >
                      {item}
                    </Button>
                  ),
                )}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                >
                  Berikutnya
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage >= totalPages}
                >
                  Paling akhir
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardContent className="space-y-4 p-4 sm:p-5">
            {!selectedRow ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground">
                Pilih full-text dari panel kiri untuk melihat detail.
              </div>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selectedRow.fullTextId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="space-y-4"
                >
                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="uppercase">{selectedRow.entryType}</Badge>
                      <Badge variant="outline" className={resultBadgeClass(statusOf(selectedRow))}>
                        {statusOf(selectedRow)}
                      </Badge>
                      <Badge variant="outline">{selectedRow.namaFile}</Badge>
                    </div>
                    <h2 className="text-2xl font-bold leading-tight">{optionalText(selectedRow.title)}</h2>
                    <p className="text-sm text-muted-foreground">
                      Citation Key: {selectedRow.citationKey}
                    </p>
                  </div>

                  <div className="grid gap-3 rounded-xl border border-border/70 bg-muted/30 p-4 text-sm md:grid-cols-2">
                    <p><span className="font-medium">Year:</span> {optionalText(selectedRow.year)}</p>
                    <p><span className="font-medium">DOI:</span> {optionalText(selectedRow.doi)}</p>
                    <p><span className="font-medium">Journal:</span> {optionalText(selectedRow.journal)}</p>
                    <p><span className="font-medium">Publisher:</span> {optionalText(selectedRow.publisher)}</p>
                  </div>

                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
                    <p className="flex items-center gap-2 text-base font-semibold">
                      <FileText className="h-4 w-4" />
                      Full-Text Preview (PDF)
                    </p>
                    <div className="overflow-hidden rounded-lg border border-border/70 bg-background/60">
                      <iframe
                        src={selectedPdfUrl}
                        title={`PDF ${selectedRow.namaFile}`}
                        className="h-[52vh] w-full"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button asChild type="button" variant="outline" size="sm">
                        <a href={selectedPdfUrl} target="_blank" rel="noreferrer">
                          Buka PDF di Tab Baru
                        </a>
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
                    <p className="flex items-center gap-2 text-base font-semibold">
                      <FileText className="h-4 w-4" />
                      Full-Text Preview (Markdown)
                    </p>
                    <pre className="max-h-[34vh] overflow-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-background/60 p-3 text-xs leading-relaxed text-muted-foreground">
                      {selectedRow.markdownPreview || "-"}
                    </pre>
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.2 }}
                    className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-semibold">Justifikasi</p>
                      <Badge variant="outline" className="text-xs">
                        AI: {optionalText(selectedRow.resultFullText?.ai)}
                      </Badge>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {optionalText(selectedRow.resultFullText?.justifikasi)}
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.2 }}
                    className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-semibold">Kriteria</p>
                      {selectedRow.resultFullText?.resultCriteria?.length ? (
                        <Badge variant="outline" className="text-xs">
                          {selectedRow.resultFullText.resultCriteria.filter((item) => item.hasil).length}/
                          {selectedRow.resultFullText.resultCriteria.length}
                        </Badge>
                      ) : null}
                    </div>

                    {selectedRow.resultFullText?.resultCriteria?.length ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {selectedRow.resultFullText.resultCriteria.map((criteriaItem, index) => (
                          <motion.div
                            key={`${selectedRow.fullTextId}-${criteriaItem.id}`}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.18, delay: 0.03 * index }}
                            className={cn(
                              "flex items-center justify-between rounded-lg border px-3 py-2",
                              criteriaCardClass(criteriaItem.typeNama),
                            )}
                          >
                            <div className="min-w-0 pr-2">
                              <p className="line-clamp-2 text-sm font-medium">{criteriaItem.nama}</p>
                              <p className="text-[11px] opacity-80">{criteriaItem.typeNama}</p>
                            </div>
                            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-current/30 bg-background/50">
                              {criteriaItem.hasil ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                        Belum ada data Hasil Kriteria untuk full-text ini.
                      </p>
                    )}
                  </motion.div>

                  <div className="grid gap-2 rounded-xl border border-border/70 bg-muted/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Button
                      type="button"
                      disabled={isSubmitting}
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      onClick={() => {
                        void submitDecision({
                          mode: "manual",
                          hasil: "Included",
                          justifikasi: "Dipilih manual oleh user di full-text screening.",
                        });
                      }}
                    >
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                      Manual Included
                    </Button>

                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isSubmitting}
                      onClick={() => {
                        void submitDecision({
                          mode: "manual",
                          hasil: "Excluded",
                          justifikasi: "Dipilih manual oleh user di full-text screening.",
                        });
                      }}
                    >
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                      Manual Excluded
                    </Button>

                    <label className="sm:col-span-2 lg:col-span-1">
                      <select
                        value={selectedModel}
                        disabled={isSubmitting}
                        onChange={(event) =>
                          setSelectedModel(event.target.value as PdfCapableAiModel)
                        }
                        className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {models.map((model) => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    </label>

                    <Button
                      type="button"
                      variant="outline"
                      className="sm:col-span-2 lg:col-span-1"
                      disabled={isSubmitting}
                      onClick={() => {
                        void submitDecision({
                          mode: "ai",
                          model: selectedModel,
                        });
                      }}
                    >
                      {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                      Analisa AI
                    </Button>
                  </div>

                  {actionError ? (
                    <p className="rounded-lg border border-rose-300/70 bg-rose-100/70 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/50 dark:bg-rose-500/10 dark:text-rose-200">
                      {actionError}
                    </p>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.section>
  );
}
