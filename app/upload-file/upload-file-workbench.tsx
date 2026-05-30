"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildPaginationItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export type IncludedReferenceUploadRow = {
  resultId: string;
  referenceId: string;
  citationKey: string;
  title: string | null;
  doi: string | null;
  year: number | null;
  journal: string | null;
  publisher: string | null;
  uploadedFilesCount: number;
  uploadedFiles: Array<{
    id: string;
    namaFile: string;
    updatedAt: string;
  }>;
};

type UploadFileWorkbenchProps = {
  rows: IncludedReferenceUploadRow[];
  totalRows: number;
  page: number;
  pageSize: number;
};

type UploadApiResponse = {
  message?: string;
  summary?: {
    mode?: "created" | "updated";
    fullTextId?: string;
    namaFile?: string;
    removedDuplicateFiles?: number;
    usedFallbackMarkdown?: boolean;
  };
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function isPdfFile(file: File): boolean {
  if (file.type === "application/pdf") {
    return true;
  }

  return file.name.toLowerCase().endsWith(".pdf");
}

function clampPage(page: number, pageCount: number): number {
  if (page < 1) {
    return 1;
  }

  if (page > pageCount) {
    return pageCount;
  }

  return page;
}

function optionalText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : "-";
}

export function UploadFileWorkbench({
  rows,
  totalRows,
  page,
  pageSize,
}: UploadFileWorkbenchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const inputRef = useRef<HTMLInputElement>(null);

  const [selectedResultId, setSelectedResultId] = useState(rows[0]?.resultId ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [invalidInfo, setInvalidInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = clampPage(page, pageCount);
  const paginationItems = buildPaginationItems({
    currentPage,
    totalPages: pageCount,
    siblingCount: 1,
  });

  const selectedReference = useMemo(
    () => rows.find((row) => row.resultId === selectedResultId) ?? null,
    [rows, selectedResultId],
  );

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedResultId("");
      return;
    }

    if (!rows.some((row) => row.resultId === selectedResultId)) {
      setSelectedResultId(rows[0].resultId);
    }
  }, [rows, selectedResultId]);

  const buildHref = useCallback(
    (nextPage: number, nextPageSize: number): string => {
      const params = new URLSearchParams(searchParamsString);
      params.set("page", String(nextPage));
      params.set("pageSize", String(nextPageSize));
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParamsString],
  );

  function goToPage(nextPage: number) {
    const safePage = clampPage(nextPage, pageCount);
    router.push(buildHref(safePage, pageSize));
  }

  function changePageSize(nextPageSize: number) {
    router.push(buildHref(1, nextPageSize));
  }

  function addFiles(nextFiles: File[]) {
    if (nextFiles.length === 0) {
      return;
    }

    const accepted = nextFiles.filter(isPdfFile);

    if (accepted.length === 0) {
      setInvalidInfo("File diabaikan karena bukan PDF.");
      return;
    }

    if (accepted.length > 1 || nextFiles.length > 1) {
      setInvalidInfo("Hanya 1 PDF diperbolehkan per reference. File pertama yang dipakai.");
    } else {
      setInvalidInfo("");
    }

    setSelectedFile(accepted[0]);
  }

  function removeFile() {
    setSelectedFile(null);
  }

  function selectReference(resultId: string) {
    setSelectedResultId(resultId);
    setSelectedFile(null);
    setInvalidInfo("");
    setSubmitError("");
    setSubmitSuccess("");
  }

  function clearFiles() {
    setSelectedFile(null);
    setInvalidInfo("");
    setSubmitError("");
    setSubmitSuccess("");
  }

  async function handleSubmit() {
    if (!selectedReference || !selectedFile) {
      return;
    }

    setSubmitError("");
    setSubmitSuccess("");
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("resultId", selectedReference.resultId);
      formData.append("pdfFile", selectedFile, selectedFile.name);

      const response = await fetch("/api/full-text/upload", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as UploadApiResponse;

      if (!response.ok) {
        const message =
          typeof payload.message === "string" && payload.message.trim().length > 0
            ? payload.message.trim()
            : "Upload file PDF gagal diproses.";
        setSubmitError(message);
        return;
      }

      const summary = payload.summary;
      if (summary) {
        const baseText =
          summary.mode === "updated"
            ? `File berhasil diperbarui${summary.removedDuplicateFiles ? ` dan ${summary.removedDuplicateFiles} duplikat dibersihkan` : ""}.`
            : "File berhasil diupload dan tersimpan.";

        const warningText = summary.usedFallbackMarkdown
          ? " Teks PDF tidak terbaca, fallback markdown disimpan (cek detail di tahap analisa)."
          : "";

        setSubmitSuccess(`${baseText}${warningText}`);
      } else {
        setSubmitSuccess("Upload file PDF berhasil diproses.");
      }

      setSelectedFile(null);
      router.refresh();
    } catch {
      setSubmitError("Terjadi gangguan jaringan saat upload file PDF.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="grid gap-4 lg:grid-cols-[360px_1fr]"
    >
      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl">References Included</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pilih reference yang akan diunggah file PDF full text-nya.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                Belum ada reference Included dari hasil analisa.
              </p>
            ) : (
              rows.map((row) => {
                const isActive = selectedReference?.resultId === row.resultId;

                return (
                  <button
                    key={row.resultId}
                    type="button"
                    onClick={() => selectReference(row.resultId)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-3 text-left transition",
                      isActive
                        ? "border-primary bg-primary/10"
                        : "border-border/80 bg-background/70 hover:bg-muted/60",
                    )}
                  >
                    <p className="line-clamp-2 text-sm font-semibold">{row.title ?? row.citationKey}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.citationKey}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {row.uploadedFilesCount > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-300/70 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200"
                        >
                          {row.uploadedFilesCount} file tersimpan
                        </Badge>
                      ) : (
                        <Badge variant="outline">Belum upload</Badge>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Page Size</Badge>
              <select
                value={pageSize}
                onChange={(event) => changePageSize(Number.parseInt(event.target.value, 10))}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={40}>40</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                  <span key={`ellipsis-${index}`} className="px-1 text-sm text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={`page-${item}`}
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
                disabled={currentPage >= pageCount}
              >
                Berikutnya
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => goToPage(pageCount)}
                disabled={currentPage >= pageCount}
              >
                Paling akhir
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Halaman {currentPage} dari {pageCount}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="space-y-3">
          <CardTitle className="text-xl">Upload PDF dan Konversi ke Markdown</CardTitle>

          {selectedReference ? (
            <div className="grid gap-2 rounded-xl border border-border/80 bg-muted/30 p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Title</p>
                <p className="line-clamp-2 font-medium">
                  {selectedReference.title ?? selectedReference.citationKey}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">DOI</p>
                <p className="truncate">{optionalText(selectedReference.doi)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Citation Key</p>
                <p>{selectedReference.citationKey}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Year</p>
                <p>{optionalText(selectedReference.year)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pilih salah satu reference dari panel kiri untuk upload file.
            </p>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              addFiles(Array.from(event.dataTransfer.files ?? []));
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "cursor-pointer rounded-2xl border border-dashed p-10 text-center transition",
              isDragging
                ? "border-primary bg-primary/10"
                : "border-cyan-300/60 bg-gradient-to-br from-cyan-50 via-white to-lime-50 hover:bg-muted/50 dark:border-cyan-500/40 dark:from-cyan-500/10 dark:via-zinc-900 dark:to-lime-500/10",
            )}
          >
            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
              <UploadCloud className="h-10 w-10 text-cyan-600 dark:text-cyan-300" />
              <p className="text-sm text-muted-foreground">
                Drag and drop file <span className="font-semibold text-foreground">.pdf</span> atau
                <span className="font-semibold text-primary"> browse</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Setelah upload, file PDF akan dikonversi ke Markdown dan disimpan ke database.
              </p>
            </div>
          </div>

          {invalidInfo ? (
            <p className="rounded-md border border-amber-300/60 bg-amber-100/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {invalidInfo}
            </p>
          ) : null}
          {submitError ? (
            <p className="rounded-md border border-rose-300/60 bg-rose-100/70 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              {submitError}
            </p>
          ) : null}
          {submitSuccess ? (
            <p className="rounded-md border border-emerald-300/60 bg-emerald-100/70 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200">
              {submitSuccess}
            </p>
          ) : null}

          <div className="space-y-2">
            {!selectedFile ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                Belum ada file yang dipilih (maksimal 1 PDF).
              </p>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={removeFile}
                  disabled={isSubmitting}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {selectedReference ? (
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3">
              <p className="mb-2 text-xs text-muted-foreground">File aktif saat ini</p>
              {selectedReference.uploadedFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada file untuk reference ini.</p>
              ) : (
                <div className="space-y-1">
                  {selectedReference.uploadedFiles.map((uploaded) => (
                    <div key={uploaded.id} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="truncate">{uploaded.namaFile}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={clearFiles}
              disabled={!selectedFile || isSubmitting}
            >
              Clear
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!selectedReference || !selectedFile || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mengunggah...
                </>
              ) : (
                "Upload & Convert"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.section>
  );
}
