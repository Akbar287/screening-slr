"use client";

import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AnimatePresence } from "framer-motion";
import { Eye, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AnalyzedReferenceTableRow } from "@/app/analysis-results/analyzed-reference-table-types";
import { buildPaginationItems } from "@/lib/pagination";

type AnalyzedReferencesTableProps = {
  rows: AnalyzedReferenceTableRow[];
  totalRows: number;
  page: number;
  pageSize: number;
};

function clampPage(page: number, pageCount: number): number {
  if (page < 1) {
    return 1;
  }

  if (page > pageCount) {
    return pageCount;
  }

  return page;
}

function resultLabel(result: "Included" | "Excluded"): string {
  return result === "Included" ? "Inclusion" : "Exclusion";
}

function resultBadgeClass(result: "Included" | "Excluded"): string {
  if (result === "Included") {
    return "border-emerald-300/70 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200";
  }

  return "border-rose-300/70 bg-rose-100 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200";
}

function optionalText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  const text = String(value).trim();
  return text.length > 0 ? text : "-";
}

export function AnalyzedReferencesTable({
  rows,
  totalRows,
  page,
  pageSize,
}: AnalyzedReferencesTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [detailTarget, setDetailTarget] = useState<AnalyzedReferenceTableRow | null>(null);

  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = clampPage(page, pageCount);
  const paginationItems = buildPaginationItems({
    currentPage,
    totalPages: pageCount,
    siblingCount: 1,
  });

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

  const closeDetailDialog = useCallback(() => {
    setDetailTarget(null);
  }, []);

  const columns = useMemo<ColumnDef<AnalyzedReferenceTableRow>[]>(
    () => [
      {
        accessorKey: "citationKey",
        header: "Citation Key",
        cell: ({ row }) => <span className="font-semibold">{row.original.citationKey}</span>,
      },
      {
        accessorKey: "entryType",
        header: "Type",
        cell: ({ row }) => (
          <span className="uppercase tracking-wide text-muted-foreground">{row.original.entryType}</span>
        ),
      },
      {
        accessorKey: "title",
        header: "Title",
        cell: ({ row }) => <span className="line-clamp-2">{row.original.title ?? "-"}</span>,
      },
      {
        accessorKey: "doi",
        header: "DOI",
        cell: ({ row }) => (
          <span className="max-w-[220px] truncate text-sm text-muted-foreground">
            {row.original.doi ?? "-"}
          </span>
        ),
      },
      {
        accessorKey: "year",
        header: "Year",
        cell: ({ row }) => <span>{row.original.year ?? "-"}</span>,
      },
      {
        accessorKey: "hasil",
        header: "Hasil",
        cell: ({ row }) => (
          <Badge variant="outline" className={resultBadgeClass(row.original.hasil)}>
            {resultLabel(row.original.hasil)}
          </Badge>
        ),
      },
      {
        accessorKey: "justifikasi",
        header: "Justifikasi",
        cell: ({ row }) => (
          <p className="line-clamp-3 max-w-md text-sm text-muted-foreground">
            {row.original.justifikasi}
          </p>
        ),
      },
      {
        accessorKey: "ai",
        header: "AI Model",
        cell: ({ row }) => (
          <span className="max-w-[220px] truncate text-sm text-muted-foreground">
            {row.original.ai}
          </span>
        ),
      },
      {
        accessorKey: "updatedAt",
        header: "Reference Updated",
        cell: ({ row }) => (
          <span>{new Date(row.original.updatedAt).toLocaleDateString("id-ID")}</span>
        ),
      },
      {
        id: "actions",
        header: "Aksi",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Lihat detail ${row.original.citationKey}`}
            onClick={() => setDetailTarget(row.original)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    manualPagination: true,
    pageCount,
    state: {
      pagination: {
        pageIndex: currentPage - 1,
        pageSize,
      },
    },
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl">Daftar Hasil Analisa</CardTitle>
              <p className="text-sm text-muted-foreground">
                Menampilkan {rows.length} dari {totalRows} data.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline">Page Size</Badge>
              <select
                value={pageSize}
                onChange={(event) => changePageSize(Number.parseInt(event.target.value, 10))}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>

                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                        Belum ada hasil analisa.
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Halaman {currentPage} dari {pageCount}
              </p>
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
            </div>
          </CardContent>
        </Card>
      </motion.section>

      <AnimatePresence>
        {detailTarget ? (
          <motion.div
            key="analysis-detail-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={closeDetailDialog}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-full max-w-3xl rounded-2xl border border-border bg-card shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold">Detail Hasil Analisa</h3>
                  <p className="text-sm text-muted-foreground">{detailTarget.citationKey}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={closeDetailDialog}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-4 px-5 py-5">
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <p><span className="font-medium">Reference ID:</span> {detailTarget.referenceId}</p>
                  <p><span className="font-medium">Type:</span> {optionalText(detailTarget.entryType)}</p>
                  <p className="md:col-span-2"><span className="font-medium">Title:</span> {optionalText(detailTarget.title)}</p>
                  <p><span className="font-medium">DOI:</span> {optionalText(detailTarget.doi)}</p>
                  <p><span className="font-medium">Year:</span> {optionalText(detailTarget.year)}</p>
                  <p><span className="font-medium">Journal:</span> {optionalText(detailTarget.journal)}</p>
                  <p><span className="font-medium">Publisher:</span> {optionalText(detailTarget.publisher)}</p>
                </div>

                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="text-sm font-medium">Hasil</p>
                  <Badge variant="outline" className={resultBadgeClass(detailTarget.hasil)}>
                    {resultLabel(detailTarget.hasil)}
                  </Badge>
                </div>

                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="text-sm font-medium">AI Model</p>
                  <p className="text-sm text-muted-foreground">{optionalText(detailTarget.ai)}</p>
                </div>

                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3">
                  <p className="text-sm font-medium">Justifikasi</p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {optionalText(detailTarget.justifikasi)}
                  </p>
                </div>

                <div className="flex justify-end">
                  <Button type="button" onClick={closeDetailDialog}>
                    Tutup
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
