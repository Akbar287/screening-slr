import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PageMotion } from "@/app/components/page-motion";
import { ReferencesTable } from "@/app/references/references-table";
import type { ReferenceTableRow } from "@/app/references/reference-table-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

const DEFAULT_PAGE_SIZE = 25;
const ALLOWED_PAGE_SIZES = [25, 50, 100] as const;

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type ReferencesPageProps = {
  searchParams?: Promise<SearchParamsRecord>;
};

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

function buildReferencesPath({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): string {
  const params = new URLSearchParams();

  params.set("page", String(Math.max(1, page)));
  params.set("pageSize", String(resolvePageSize(pageSize)));

  return `/references?${params.toString()}`;
}

export default async function ReferencesPage({ searchParams }: ReferencesPageProps) {
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

  const totalRows = await prisma.bibReference.count({
    where: {
      userId,
    },
  });

  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = requestedPage > pageCount ? pageCount : requestedPage;

  if (page !== requestedPage) {
    redirect(
      buildReferencesPath({
        page,
        pageSize,
      }),
    );
  }

  const references = await prisma.bibReference.findMany({
    where: {
      userId,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
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
      updatedAt: true,
    },
  });

  const tableRows: ReferenceTableRow[] = references.map((reference) => ({
    id: reference.id.toString(),
    citationKey: reference.citationKey,
    entryType: reference.entryType,
    title: reference.title,
    year: reference.year,
    journal: reference.journal,
    publisher: reference.publisher,
    doi: reference.doi,
    url: reference.url,
    updatedAt: reference.updatedAt.toISOString(),
  }));

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-100 px-6 py-10 dark:bg-zinc-950">
      <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-sky-300/25 blur-3xl dark:bg-sky-500/20" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-500/20" />

      <main className="mx-auto flex max-w-6xl flex-col gap-6 py-4">
        <PageMotion>
          <Card className="border-border/70 bg-card/95 shadow-xl">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <Badge variant="secondary" className="uppercase tracking-[0.2em]">
                  Kelola References
                </Badge>
                <CardTitle className="text-3xl">Daftar Bib References</CardTitle>
                <CardDescription>
                  Halaman ini hanya menampilkan tabel references dengan pagination.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/references/manage">Upload / Tambah Reference</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/references/deduplicate">Hilangkan Duplikasi</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/">Kembali ke Dashboard</Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </PageMotion>

        <ReferencesTable
          rows={tableRows}
          totalRows={totalRows}
          page={page}
          pageSize={pageSize}
        />
      </main>
    </div>
  );
}
