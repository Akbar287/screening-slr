import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PageMotion } from "@/app/components/page-motion";
import { AnalyzedReferencesTable } from "@/app/analysis-results/analyzed-references-table";
import type { AnalyzedReferenceTableRow } from "@/app/analysis-results/analyzed-reference-table-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { createPageMetadata } from "@/lib/seo";

const DEFAULT_PAGE_SIZE = 25;
const ALLOWED_PAGE_SIZES = [25, 50, 100] as const;

export const metadata = createPageMetadata({
  title: "Hasil Analisa Abstract",
  description:
    "Lihat hasil analisa references: status Included/Excluded, justifikasi, dan detail AI screening.",
  path: "/analysis-results",
  keywords: ["analysis results", "included excluded", "ai screening result"],
  noIndex: true,
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AnalysisResultsPageProps = {
  searchParams?: Promise<SearchParamsRecord>;
};

type ResultFilterValue = "all" | "Included" | "Excluded";
type SearchFieldValue = "nama" | "doi";

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function resolvePageSize(value: number | null | undefined): number {
  if (!value) {
    return DEFAULT_PAGE_SIZE;
  }

  return ALLOWED_PAGE_SIZES.includes(value as (typeof ALLOWED_PAGE_SIZES)[number])
    ? value
    : DEFAULT_PAGE_SIZE;
}

function buildAnalysisResultsPath({
  page,
  pageSize,
  hasil,
  field,
  keyword,
}: {
  page: number;
  pageSize: number;
  hasil: ResultFilterValue;
  field: SearchFieldValue;
  keyword: string;
}): string {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, page)));
  params.set("pageSize", String(resolvePageSize(pageSize)));

  if (hasil !== "all") {
    params.set("hasil", hasil);
  }

  if (field !== "nama") {
    params.set("field", field);
  }

  if (keyword.length > 0) {
    params.set("keyword", keyword);
  }

  return `/analysis-results?${params.toString()}`;
}

function parseResultFilter(value: string | undefined): ResultFilterValue {
  if (value === "Included") {
    return "Included";
  }

  if (value === "Excluded") {
    return "Excluded";
  }

  return "all";
}

function parseSearchField(value: string | undefined): SearchFieldValue {
  if (value === "doi") {
    return "doi";
  }

  return "nama";
}

function normalizeKeyword(value: string | undefined): string {
  return value?.trim() ?? "";
}

export default async function AnalysisResultsPage({
  searchParams,
}: AnalysisResultsPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = BigInt(session.user.id);
  const resolvedSearchParams = (searchParams ? await searchParams : undefined) ?? {};

  const requestedPage = parsePositiveInt(firstSearchValue(resolvedSearchParams.page)) ?? 1;
  const pageSize = resolvePageSize(
    parsePositiveInt(firstSearchValue(resolvedSearchParams.pageSize)),
  );
  const hasilFilter = parseResultFilter(firstSearchValue(resolvedSearchParams.hasil));
  const searchField = parseSearchField(firstSearchValue(resolvedSearchParams.field));
  const keyword = normalizeKeyword(firstSearchValue(resolvedSearchParams.keyword));

  const referencesWhere =
    keyword.length > 0
      ? {
          userId,
          ...(searchField === "doi"
            ? {
                doi: {
                  contains: keyword,
                  mode: "insensitive" as const,
                },
              }
            : {
                title: {
                  contains: keyword,
                  mode: "insensitive" as const,
                },
              }),
        }
      : {
          userId,
        };

  const resultWhere = {
    references: referencesWhere,
    ...(hasilFilter !== "all"
      ? {
          hasil: hasilFilter,
        }
      : {}),
  };

  const totalRows = await prisma.result.count({
    where: resultWhere,
  });

  const includedCount = await prisma.result.count({
    where: {
      hasil: "Included",
      references: {
        userId,
      },
    },
  });

  const excludedCount = await prisma.result.count({
    where: {
      hasil: "Excluded",
      references: {
        userId,
      },
    },
  });

  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = requestedPage > pageCount ? pageCount : requestedPage;

  if (page !== requestedPage) {
    redirect(
      buildAnalysisResultsPath({
        page,
        pageSize,
        hasil: hasilFilter,
        field: searchField,
        keyword,
      }),
    );
  }

  const resultRows = await prisma.result.findMany({
    where: resultWhere,
    orderBy: [{ referencesId: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      hasil: true,
      justifikasi: true,
      ai: true,
      resultCriteria: {
        orderBy: [{ criteriaId: "asc" }],
        select: {
          hasil: true,
          criteria: {
            select: {
              id: true,
              nama: true,
              typeCriteria: {
                select: {
                  nama: true,
                },
              },
            },
          },
        },
      },
      references: {
        select: {
          id: true,
          citationKey: true,
          entryType: true,
          title: true,
          doi: true,
          year: true,
          journal: true,
          publisher: true,
          updatedAt: true,
        },
      },
    },
  });

  const tableRows: AnalyzedReferenceTableRow[] = resultRows.map((row) => ({
    id: row.id.toString(),
    referenceId: row.references.id.toString(),
    citationKey: row.references.citationKey,
    entryType: row.references.entryType,
    title: row.references.title,
    doi: row.references.doi,
    year: row.references.year,
    journal: row.references.journal,
    publisher: row.references.publisher,
    hasil: row.hasil,
    justifikasi: row.justifikasi,
    ai: row.ai,
    updatedAt: row.references.updatedAt.toISOString(),
    resultCriteria: row.resultCriteria.map((item) => ({
      id: item.criteria.id.toString(),
      nama: item.criteria.nama,
      typeNama: item.criteria.typeCriteria.nama,
      hasil: item.hasil,
    })),
  }));

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-100 px-6 py-10 dark:bg-zinc-950">
      <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl dark:bg-cyan-500/20" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-lime-300/20 blur-3xl dark:bg-lime-500/15" />

      <main className="mx-auto flex max-w-6xl flex-col gap-6 py-4">
        <PageMotion>
          <Card className="border-border/70 bg-card/95 shadow-xl">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <Badge variant="secondary" className="uppercase tracking-[0.2em]">
                  Analysis Results
                </Badge>
                <CardTitle className="text-3xl">Hasil Analisa BibTeX</CardTitle>
                <CardDescription>
                  Menampilkan references yang sudah dianalisa lengkap dengan hasil
                  Inclusion/Exclusion dan justifikasi.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-emerald-300/70 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200"
                >
                  Inclusion: {includedCount}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-rose-300/70 bg-rose-100 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200"
                >
                  Exclusion: {excludedCount}
                </Badge>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/">Kembali ke Dashboard</Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </PageMotion>

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Filter Hasil Analisa</CardTitle>
          </CardHeader>
          <CardContent>
            <form action="/analysis-results" className="grid gap-3 md:grid-cols-[180px_160px_1fr_auto_auto]">
              <input type="hidden" name="page" value="1" />
              <input type="hidden" name="pageSize" value={pageSize} />

              <select
                name="hasil"
                defaultValue={hasilFilter}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">Semua Hasil</option>
                <option value="Included">Inclusion</option>
                <option value="Excluded">Exclusion</option>
              </select>

              <select
                name="field"
                defaultValue={searchField}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="nama">Nama (Title)</option>
                <option value="doi">DOI</option>
              </select>

              <input
                type="text"
                name="keyword"
                defaultValue={keyword}
                placeholder={searchField === "doi" ? "Cari DOI..." : "Cari nama/title..."}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />

              <Button type="submit">Terapkan</Button>

              <Button
                asChild
                type="button"
                variant="outline"
              >
                <Link href={buildAnalysisResultsPath({
                  page: 1,
                  pageSize,
                  hasil: "all",
                  field: "nama",
                  keyword: "",
                })}>
                  Reset
                </Link>
              </Button>
            </form>
          </CardContent>
        </Card>

        <AnalyzedReferencesTable
          rows={tableRows}
          totalRows={totalRows}
          page={page}
          pageSize={pageSize}
        />

        {totalRows === 0 ? (
          <Card className="border-dashed border-border/80 bg-card/95">
            <CardContent className="p-5 text-sm text-muted-foreground">
              Belum ada data yang cocok dengan filter saat ini.
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
