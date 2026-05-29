"use client";

import { useCallback, useMemo } from "react";
import { motion } from "framer-motion";
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
  );
}
