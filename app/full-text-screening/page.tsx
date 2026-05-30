import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { ResultStatus } from "@/generated/prisma/client";
import { PageMotion } from "@/app/components/page-motion";
import {
  FullTextScreeningWorkbench,
  type FullTextScreeningRow,
} from "@/app/full-text-screening/full-text-screening-workbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPdfCapableAiModels } from "@/lib/ai-models";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

type SearchParamsRecord = Record<string, string | string[] | undefined>;
const FULL_TEXT_PAGE_SIZE = 20;

type FullTextScreeningPageProps = {
  searchParams?: Promise<SearchParamsRecord>;
};

type FullTextFilter = "undecided" | "included" | "excluded" | "all";

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseFullTextFilter(value: string | undefined): FullTextFilter {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "included") {
    return "included";
  }

  if (normalized === "excluded") {
    return "excluded";
  }

  if (normalized === "all") {
    return "all";
  }

  return "undecided";
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

function decodeMarkdownPreview(bytes: Uint8Array, maxLength = 5_000): string {
  const text = new TextDecoder("utf-8").decode(bytes).trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n\n[TRUNCATED PREVIEW]`;
}

function buildFullTextScreeningPath({
  filter,
  page,
  fullTextId,
}: {
  filter: FullTextFilter;
  page: number;
  fullTextId?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("status", filter);
  params.set("page", String(Math.max(1, page)));

  if (typeof fullTextId === "string" && fullTextId.trim().length > 0) {
    params.set("fullTextId", fullTextId.trim());
  }

  return `/full-text-screening?${params.toString()}`;
}

export default async function FullTextScreeningPage({
  searchParams,
}: FullTextScreeningPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUserId = parseUserId(session.user.id);

  if (!currentUserId) {
    redirect("/login");
  }

  const resolvedSearchParams = (searchParams ? await searchParams : undefined) ?? {};
  const selectedFilter = parseFullTextFilter(firstSearchValue(resolvedSearchParams.status));
  const selectedFullTextId = firstSearchValue(resolvedSearchParams.fullTextId)?.trim() ?? "";
  const requestedPage = parsePositiveInt(firstSearchValue(resolvedSearchParams.page)) ?? 1;

  const baseWhere = {
    result: {
      hasil: ResultStatus.Included,
      references: {
        userId: currentUserId,
      },
    },
  };

  const whereByFilter =
    selectedFilter === "included"
      ? {
        resultFullText: {
          some: {
            hasil: ResultStatus.Included,
          },
        },
      }
      : selectedFilter === "excluded"
        ? {
          resultFullText: {
            some: {
              hasil: ResultStatus.Excluded,
            },
          },
        }
        : selectedFilter === "undecided"
          ? {
            resultFullText: {
              none: {},
            },
          }
          : {};

  const [totalRows, undecidedCount, includedCount, excludedCount, filteredTotalRows] =
    await Promise.all([
      prisma.fullText.count({
        where: baseWhere,
      }),
      prisma.fullText.count({
        where: {
          ...baseWhere,
          resultFullText: {
            none: {},
          },
        },
      }),
      prisma.fullText.count({
        where: {
          ...baseWhere,
          resultFullText: {
            some: {
              hasil: ResultStatus.Included,
            },
          },
        },
      }),
      prisma.fullText.count({
        where: {
          ...baseWhere,
          resultFullText: {
            some: {
              hasil: ResultStatus.Excluded,
            },
          },
        },
      }),
      prisma.fullText.count({
        where: {
          ...baseWhere,
          ...whereByFilter,
        },
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(filteredTotalRows / FULL_TEXT_PAGE_SIZE));
  const currentPage = requestedPage > totalPages ? totalPages : requestedPage;

  if (currentPage !== requestedPage) {
    redirect(
      buildFullTextScreeningPath({
        filter: selectedFilter,
        page: currentPage,
        fullTextId: selectedFullTextId || null,
      }),
    );
  }

  const fullTextRows = await prisma.fullText.findMany({
    where: {
      ...baseWhere,
      ...whereByFilter,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * FULL_TEXT_PAGE_SIZE,
    take: FULL_TEXT_PAGE_SIZE,
    select: {
      id: true,
      resultId: true,
      namaFile: true,
      fileMd: true,
      updatedAt: true,
      result: {
        select: {
          references: {
            select: {
              id: true,
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
      resultFullText: {
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          hasil: true,
          justifikasi: true,
          ai: true,
          resultFullTextCriteria: {
            orderBy: [{ criteriaId: "asc" }],
            select: {
              result: true,
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
        },
      },
    },
  });

  const rows: FullTextScreeningRow[] = fullTextRows.map((item) => {
    const latestResult = item.resultFullText[0] ?? null;

    return {
      fullTextId: item.id.toString(),
      resultId: item.resultId.toString(),
      referenceId: item.result.references.id.toString(),
      citationKey: item.result.references.citationKey,
      entryType: item.result.references.entryType,
      title: item.result.references.title,
      year: item.result.references.year,
      journal: item.result.references.journal,
      publisher: item.result.references.publisher,
      doi: item.result.references.doi,
      namaFile: item.namaFile,
      updatedAt: item.updatedAt.toISOString(),
      markdownPreview: decodeMarkdownPreview(item.fileMd),
      resultFullText: latestResult
        ? {
          id: latestResult.id.toString(),
          hasil: latestResult.hasil,
          justifikasi: latestResult.justifikasi,
          ai: latestResult.ai,
          resultCriteria: latestResult.resultFullTextCriteria.map((criteriaItem) => ({
            id: criteriaItem.criteria.id.toString(),
            nama: criteriaItem.criteria.nama,
            typeNama: criteriaItem.criteria.typeCriteria.nama,
            hasil: criteriaItem.result,
          })),
        }
        : null,
    };
  });

  const effectiveSelectedFullTextId =
    selectedFullTextId && rows.some((item) => item.fullTextId === selectedFullTextId)
      ? selectedFullTextId
      : rows[0]?.fullTextId ?? null;

  const models = getPdfCapableAiModels();
  const defaultModel = models[0] ?? "openai/gpt-5.4";

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-100 px-6 py-8 dark:bg-zinc-950">
      <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-500/20" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/15" />

      <main className="mx-auto flex max-w-[1800px] flex-col gap-5 py-2">
        <PageMotion>
          <Card className="border-border/70 bg-card/95 shadow-xl">
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <Badge variant="secondary" className="uppercase tracking-[0.2em]">
                  Tahap 2
                </Badge>
                <CardTitle className="text-3xl">Analisa Full-Text Interaktif</CardTitle>
                <CardDescription>
                  Pilih full-text di panel kiri, lihat preview markdown, lalu tentukan Included/Excluded
                  manual atau jalankan analisa AI per full-text.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-cyan-300/70 bg-cyan-100 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-200"
                >
                  Undecided: {undecidedCount}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-emerald-300/70 bg-emerald-100 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200"
                >
                  Included: {includedCount}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-rose-300/70 bg-rose-100 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/20 dark:text-rose-200"
                >
                  Excluded: {excludedCount}
                </Badge>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/upload-file">Kembali ke Upload Full-Text</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/">Kembali ke Dashboard</Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </PageMotion>

        <FullTextScreeningWorkbench
          rows={rows}
          totalRows={totalRows}
          undecidedCount={undecidedCount}
          includedCount={includedCount}
          excludedCount={excludedCount}
          filteredTotalRows={filteredTotalRows}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={FULL_TEXT_PAGE_SIZE}
          selectedFullTextId={effectiveSelectedFullTextId}
          activeFilter={selectedFilter}
          models={models}
          defaultModel={defaultModel}
        />
      </main>
    </div>
  );
}
