import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PageMotion } from "@/app/components/page-motion";
import { ScreeningWorkbench } from "@/app/screening/screening-workbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authOptions } from "@/lib/auth-options";
import { getSupportedAiModels } from "@/lib/ai-models";
import { prisma } from "@/lib/prisma";
import { createPageMetadata } from "@/lib/seo";

type SearchParamsRecord = Record<string, string | string[] | undefined>;
const SCREENING_PAGE_SIZE = 25;

export const metadata = createPageMetadata({
  title: "Screening Interaktif Abstract",
  description:
    "Halaman screening interaktif untuk memutuskan Included/Excluded per reference dengan bantuan AI.",
  path: "/screening",
  keywords: ["screening interaktif", "manual screening", "ai abstract screening"],
  noIndex: true,
});

type ScreeningPageProps = {
  searchParams?: Promise<SearchParamsRecord>;
};

type ScreeningFilter = "undecided" | "included" | "excluded" | "all";

function firstSearchValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseScreeningFilter(value: string | undefined): ScreeningFilter {
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

function buildScreeningPath({
  filter,
  page,
  ref,
}: {
  filter: ScreeningFilter;
  page: number;
  ref?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("status", filter);
  params.set("page", String(Math.max(1, page)));

  if (typeof ref === "string" && ref.trim().length > 0) {
    params.set("ref", ref.trim());
  }

  return `/screening?${params.toString()}`;
}

export default async function ScreeningPage({ searchParams }: ScreeningPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUserId = parseUserId(session.user.id);

  if (!currentUserId) {
    redirect("/login");
  }

  const resolvedSearchParams = (searchParams ? await searchParams : undefined) ?? {};
  const selectedFilter = parseScreeningFilter(firstSearchValue(resolvedSearchParams.status));
  const selectedReferenceId = firstSearchValue(resolvedSearchParams.ref)?.trim() ?? "";
  const requestedPage = parsePositiveInt(firstSearchValue(resolvedSearchParams.page)) ?? 1;

  const whereByFilter =
    selectedFilter === "included"
      ? {
        result: {
          is: {
            hasil: "Included" as const,
          },
        },
      }
      : selectedFilter === "excluded"
        ? {
          result: {
            is: {
              hasil: "Excluded" as const,
            },
          },
        }
        : selectedFilter === "undecided"
          ? {
            result: {
              is: null,
            },
          }
          : {};

  const [totalReferences, undecidedCount, includedCount, excludedCount, filteredTotalRows] =
    await Promise.all([
      prisma.bibReference.count({
        where: {
          userId: currentUserId,
        },
      }),
      prisma.bibReference.count({
        where: {
          userId: currentUserId,
          result: {
            is: null,
          },
        },
      }),
      prisma.result.count({
        where: {
          hasil: "Included",
          references: {
            userId: currentUserId,
          },
        },
      }),
      prisma.result.count({
        where: {
          hasil: "Excluded",
          references: {
            userId: currentUserId,
          },
        },
      }),
      prisma.bibReference.count({
        where: {
          userId: currentUserId,
          ...whereByFilter,
        },
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(filteredTotalRows / SCREENING_PAGE_SIZE));
  const currentPage = requestedPage > totalPages ? totalPages : requestedPage;

  if (currentPage !== requestedPage) {
    redirect(
      buildScreeningPath({
        filter: selectedFilter,
        page: currentPage,
        ref: selectedReferenceId || null,
      }),
    );
  }

  const references = await prisma.bibReference.findMany({
    where: {
      userId: currentUserId,
      ...whereByFilter,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * SCREENING_PAGE_SIZE,
    take: SCREENING_PAGE_SIZE,
    select: {
      id: true,
      citationKey: true,
      entryType: true,
      title: true,
      year: true,
      journal: true,
      publisher: true,
      doi: true,
      url: true,
      abstract: true,
      keywords: true,
      note: true,
      result: {
        select: {
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
        },
      },
    },
  });

  const listRows = references.map((item) => ({
    id: item.id.toString(),
    citationKey: item.citationKey,
    entryType: item.entryType,
    title: item.title,
    year: item.year,
    journal: item.journal,
    publisher: item.publisher,
    doi: item.doi,
    url: item.url,
    abstract: item.abstract,
    keywords: item.keywords,
    note: item.note,
    result: item.result
      ? {
        hasil: item.result.hasil,
        justifikasi: item.result.justifikasi,
        ai: item.result.ai,
        resultCriteria: item.result.resultCriteria.map((criteriaItem) => ({
          id: criteriaItem.criteria.id.toString(),
          nama: criteriaItem.criteria.nama,
          typeNama: criteriaItem.criteria.typeCriteria.nama,
          hasil: criteriaItem.hasil,
        })),
      }
      : null,
  }));

  const effectiveSelectedReferenceId =
    selectedReferenceId && listRows.some((item) => item.id === selectedReferenceId)
      ? selectedReferenceId
      : listRows[0]?.id ?? null;

  const models = getSupportedAiModels();
  const defaultModel = models[0] ?? "openai/gpt-5.4";

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-100 px-6 py-8 dark:bg-zinc-950">
      <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl dark:bg-cyan-500/20" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-lime-300/20 blur-3xl dark:bg-lime-500/15" />

      <main className="mx-auto flex max-w-[1800px] flex-col gap-5 py-2">
        <PageMotion>
          <Card className="border-border/70 bg-card/95 shadow-xl">
            <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <Badge variant="secondary" className="uppercase tracking-[0.2em]">
                  Screening Workspace
                </Badge>
                <CardTitle className="text-3xl">Screening References Interaktif</CardTitle>
                <CardDescription>
                  Pilih reference di panel kiri, lihat detail, lalu tentukan Included/Excluded
                  secara manual atau jalankan analisa AI per reference.
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
                  <Link href="/">Kembali ke Dashboard</Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </PageMotion>

        <ScreeningWorkbench
          references={listRows}
          totalReferences={totalReferences}
          filteredTotalRows={filteredTotalRows}
          undecidedCount={undecidedCount}
          includedCount={includedCount}
          excludedCount={excludedCount}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={SCREENING_PAGE_SIZE}
          selectedReferenceId={effectiveSelectedReferenceId}
          activeFilter={selectedFilter}
          models={models}
          defaultModel={defaultModel}
        />
      </main>
    </div>
  );
}
