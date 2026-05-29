"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Trash2, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReferenceTableRow } from "@/app/references/reference-table-types";
import { buildPaginationItems } from "@/lib/pagination";

type ReferencesTableProps = {
  rows: ReferenceTableRow[];
  totalRows: number;
  page: number;
  pageSize: number;
};

type ReferenceEditForm = {
  id: string;
  citationKey: string;
  entryType: string;
  title: string;
  year: string;
  journal: string;
  publisher: string;
  doi: string;
  url: string;
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

function mapReferenceToEditForm(reference: ReferenceTableRow): ReferenceEditForm {
  return {
    id: reference.id,
    citationKey: reference.citationKey,
    entryType: reference.entryType,
    title: reference.title ?? "",
    year: reference.year !== null ? String(reference.year) : "",
    journal: reference.journal ?? "",
    publisher: reference.publisher ?? "",
    doi: reference.doi ?? "",
    url: reference.url ?? "",
  };
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

export function ReferencesTable({
  rows,
  totalRows,
  page,
  pageSize,
}: ReferencesTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();

  const [editForm, setEditForm] = useState<ReferenceEditForm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReferenceTableRow | null>(null);
  const [dialogError, setDialogError] = useState<string>("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      params.delete("edit");

      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParamsString],
  );

  const openEditDialog = useCallback((reference: ReferenceTableRow) => {
    setDialogError("");
    setEditForm(mapReferenceToEditForm(reference));
  }, []);

  const openDeleteDialog = useCallback((reference: ReferenceTableRow) => {
    setDialogError("");
    setDeleteTarget(reference);
  }, []);

  const closeEditDialog = useCallback(() => {
    if (isSubmittingEdit) {
      return;
    }

    setDialogError("");
    setEditForm(null);
  }, [isSubmittingEdit]);

  const closeDeleteDialog = useCallback(() => {
    if (isDeleting) {
      return;
    }

    setDialogError("");
    setDeleteTarget(null);
  }, [isDeleting]);

  function goToPage(nextPage: number) {
    const safePage = clampPage(nextPage, pageCount);
    router.push(buildHref(safePage, pageSize));
  }

  function changePageSize(nextPageSize: number) {
    router.push(buildHref(1, nextPageSize));
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editForm) {
      return;
    }

    setDialogError("");
    setIsSubmittingEdit(true);

    try {
      const response = await fetch(`/api/references/${editForm.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          citationKey: editForm.citationKey,
          entryType: editForm.entryType,
          title: editForm.title,
          year: editForm.year,
          journal: editForm.journal,
          publisher: editForm.publisher,
          doi: editForm.doi,
          url: editForm.url,
        }),
      });

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Gagal memperbarui reference.",
        );
        setDialogError(message);
        return;
      }

      setEditForm(null);
      router.refresh();
    } catch {
      setDialogError("Terjadi gangguan jaringan saat memperbarui reference.");
    } finally {
      setIsSubmittingEdit(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) {
      return;
    }

    setDialogError("");
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/references/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          "Gagal menghapus reference.",
        );
        setDialogError(message);
        return;
      }

      setDeleteTarget(null);
      router.refresh();
    } catch {
      setDialogError("Terjadi gangguan jaringan saat menghapus reference.");
    } finally {
      setIsDeleting(false);
    }
  }

  const columns = useMemo<ColumnDef<ReferenceTableRow>[]>(
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
        accessorKey: "year",
        header: "Year",
        cell: ({ row }) => <span>{row.original.year ?? "-"}</span>,
      },
      {
        accessorKey: "journal",
        header: "Journal",
        cell: ({ row }) => <span>{row.original.journal ?? "-"}</span>,
      },
      {
        accessorKey: "publisher",
        header: "Publisher",
        cell: ({ row }) => <span>{row.original.publisher ?? "-"}</span>,
      },
      {
        accessorKey: "updatedAt",
        header: "Updated",
        cell: ({ row }) => <span>{new Date(row.original.updatedAt).toLocaleDateString("id-ID")}</span>,
      },
      {
        id: "actions",
        header: "Aksi",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Edit ${row.original.citationKey}`}
              onClick={() => openEditDialog(row.original)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={`Hapus ${row.original.citationKey}`}
              onClick={() => openDeleteDialog(row.original)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ),
      },
    ],
    [openDeleteDialog, openEditDialog],
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
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl">Daftar References</CardTitle>
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
                        Belum ada reference.
                      </TableCell>
                    </TableRow>
                  ) : (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
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
                <Button type="button" variant="outline" size="sm" onClick={() => goToPage(1)} disabled={currentPage <= 1}>
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
        {editForm ? (
          <motion.div
            key="edit-reference-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={closeEditDialog}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h3 className="text-lg font-semibold">Edit Reference</h3>
                  <p className="text-sm text-muted-foreground">{editForm.citationKey}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={closeEditDialog}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4 px-5 py-5">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span>Citation Key</span>
                    <Input
                      required
                      value={editForm.citationKey}
                      onChange={(event) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                citationKey: event.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span>Entry Type</span>
                    <Input
                      required
                      value={editForm.entryType}
                      onChange={(event) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                entryType: event.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm md:col-span-2">
                    <span>Title</span>
                    <Input
                      value={editForm.title}
                      onChange={(event) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                title: event.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span>Year</span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={editForm.year}
                      onChange={(event) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                year: event.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span>Journal</span>
                    <Input
                      value={editForm.journal}
                      onChange={(event) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                journal: event.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span>Publisher</span>
                    <Input
                      value={editForm.publisher}
                      onChange={(event) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                publisher: event.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm">
                    <span>DOI</span>
                    <Input
                      value={editForm.doi}
                      onChange={(event) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                doi: event.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </label>

                  <label className="space-y-1 text-sm md:col-span-2">
                    <span>URL</span>
                    <Input
                      value={editForm.url}
                      onChange={(event) =>
                        setEditForm((prev) =>
                          prev
                            ? {
                                ...prev,
                                url: event.target.value,
                              }
                            : prev,
                        )
                      }
                    />
                  </label>
                </div>

                {dialogError ? (
                  <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {dialogError}
                  </p>
                ) : null}

                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" onClick={closeEditDialog} disabled={isSubmittingEdit}>
                    Batal
                  </Button>
                  <Button type="submit" disabled={isSubmittingEdit}>
                    {isSubmittingEdit ? "Menyimpan..." : "Simpan Perubahan"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget ? (
          <motion.div
            key="delete-reference-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className="absolute inset-0 bg-black/60"
              onClick={closeDeleteDialog}
              aria-hidden="true"
            />
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card px-5 py-5 shadow-2xl"
            >
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Hapus Reference?</h3>
                <p className="text-sm text-muted-foreground">
                  Data dengan citation key <span className="font-semibold">{deleteTarget.citationKey}</span> akan dihapus permanen.
                </p>
              </div>

              {dialogError ? (
                <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {dialogError}
                </p>
              ) : null}

              <div className="mt-5 flex items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeDeleteDialog} disabled={isDeleting}>
                  Batal
                </Button>
                <Button type="button" variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
                  {isDeleting ? "Menghapus..." : "Ya, Hapus"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
