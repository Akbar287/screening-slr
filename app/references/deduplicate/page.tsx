import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PageMotion } from "@/app/components/page-motion";
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
import {
  detectReferenceExactDuplicatePairs,
  type DuplicatePair,
} from "@/lib/reference-duplicates";

const DEFAULT_PAGE_SIZE = 10;
const ALLOWED_PAGE_SIZES = [5, 10, 20] as const;

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type DeduplicatePageProps = {
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

function buildDeduplicatePath({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): string {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, page)));
  params.set("pageSize", String(resolvePageSize(pageSize)));
  return `/references/deduplicate?${params.toString()}`;
}

function parseBigIntValue(value: FormDataEntryValue | null): bigint | null {
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) {
    return null;
  }

  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function normalizeTitle(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDoi(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "")
    .replace(/\s+/g, "")
    .trim();
}

function formatOptionalValue(value: string | number | null | undefined): string {
  if (value == null) {
    return "-";
  }

  const text = String(value).trim();
  return text.length > 0 ? text : "-";
}

function PairReferenceCard({
  side,
  pair,
  page,
  pageSize,
}: {
  side: "left" | "right";
  pair: DuplicatePair;
  page: number;
  pageSize: number;
}) {
  const current = side === "left" ? pair.left : pair.right;
  const opposite = side === "left" ? pair.right : pair.left;

  return (
    <Card className="border-border/70 bg-card/95">
      <CardHeader>
        <CardTitle className="text-lg">{formatOptionalValue(current.title)}</CardTitle>
        <CardDescription>Citation Key: {current.citationKey}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-2 text-sm">
        <p><span className="font-medium">DOI:</span> {formatOptionalValue(current.doi)}</p>
        <p><span className="font-medium">Type:</span> {formatOptionalValue(current.entryType)}</p>
        <p><span className="font-medium">Year:</span> {formatOptionalValue(current.year)}</p>
        <p><span className="font-medium">Journal:</span> {formatOptionalValue(current.journal)}</p>
        <p><span className="font-medium">Publisher:</span> {formatOptionalValue(current.publisher)}</p>

        <form action={resolveDuplicatePairAction} className="pt-3">
          <input type="hidden" name="keepReferenceId" value={opposite.id.toString()} />
          <input type="hidden" name="deleteReferenceId" value={current.id.toString()} />
          <input type="hidden" name="page" value={page} />
          <input type="hidden" name="pageSize" value={pageSize} />
          <Button type="submit" variant="destructive" className="w-full">
            Hapus
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Reference di card sebelah otomatis dipertahankan.
        </p>
      </CardContent>
    </Card>
  );
}

async function resolveDuplicatePairAction(formData: FormData) {
  "use server";

  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const currentUserId = BigInt(userId);
  const keepReferenceId = parseBigIntValue(formData.get("keepReferenceId"));
  const deleteReferenceId = parseBigIntValue(formData.get("deleteReferenceId"));
  const rawPage = formData.get("page");
  const rawPageSize = formData.get("pageSize");

  const page = parsePositiveInt(typeof rawPage === "string" ? rawPage : undefined) ?? 1;
  const pageSize = resolvePageSize(
    parsePositiveInt(typeof rawPageSize === "string" ? rawPageSize : undefined),
  );

  if (!keepReferenceId || !deleteReferenceId || keepReferenceId === deleteReferenceId) {
    redirect(buildDeduplicatePath({ page, pageSize }));
  }

  const matchedReferences = await prisma.bibReference.findMany({
    where: {
      userId: currentUserId,
      id: {
        in: [keepReferenceId, deleteReferenceId],
      },
    },
    select: {
      id: true,
      title: true,
      doi: true,
    },
  });

  if (matchedReferences.length !== 2) {
    redirect(buildDeduplicatePath({ page, pageSize }));
  }

  const keptReference = matchedReferences.find(
    (reference) => reference.id === keepReferenceId,
  );
  const deletedReference = matchedReferences.find(
    (reference) => reference.id === deleteReferenceId,
  );

  if (!keptReference || !deletedReference) {
    redirect(buildDeduplicatePath({ page, pageSize }));
  }

  const keptTitle = normalizeTitle(keptReference.title);
  const deletedTitle = normalizeTitle(deletedReference.title);
  const keptDoi = normalizeDoi(keptReference.doi);
  const deletedDoi = normalizeDoi(deletedReference.doi);

  const sameTitle = keptTitle === deletedTitle;
  const sameDoi = keptDoi === deletedDoi;

  if (!sameTitle || !sameDoi || !keptTitle || !keptDoi) {
    redirect(buildDeduplicatePath({ page, pageSize }));
  }

  await prisma.bibReference.deleteMany({
    where: {
      userId: currentUserId,
      id: deleteReferenceId,
    },
  });

  revalidatePath("/");
  revalidatePath("/analysis-results");
  revalidatePath("/references");
  revalidatePath("/references/deduplicate");

  redirect(buildDeduplicatePath({ page, pageSize }));
}

export default async function DeduplicateReferencesPage({
  searchParams,
}: DeduplicatePageProps) {
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

  const references = await prisma.bibReference.findMany({
    where: {
      userId,
    },
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
    orderBy: [{ id: "asc" }],
  });

  const detectedPairs = detectReferenceExactDuplicatePairs(references, {
    maxPairs: 600,
  });

  const totalPairs = detectedPairs.length;
  const pageCount = Math.max(1, Math.ceil(totalPairs / pageSize));
  const page = requestedPage > pageCount ? pageCount : requestedPage;

  if (page !== requestedPage) {
    redirect(buildDeduplicatePath({ page, pageSize }));
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pagedPairs = detectedPairs.slice(start, end);

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-100 px-6 py-10 dark:bg-zinc-950">
      <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-500/20" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/15" />

      <main className="mx-auto flex max-w-6xl flex-col gap-6 py-4">
        <PageMotion>
          <Card className="border-border/70 bg-card/95 shadow-xl">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <Badge variant="secondary" className="uppercase tracking-[0.2em]">
                  Deduplicate References
                </Badge>
                <CardTitle className="text-3xl">Hilangkan Duplikasi References</CardTitle>
                <CardDescription>
                  Sistem hanya menampilkan pasangan references dengan DOI yang sama dan
                  judul yang sama.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-amber-300/70 bg-amber-100 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/20 dark:text-amber-200"
                >
                  Total Kandidat: {totalPairs}
                </Badge>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/references">Kembali ke References</Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </PageMotion>

        {pagedPairs.length === 0 ? (
          <Card className="border-dashed border-border/80 bg-card/95">
            <CardContent className="p-5 text-sm text-muted-foreground">
              Tidak ada kandidat duplikasi dengan DOI dan judul yang sama.
            </CardContent>
          </Card>
        ) : (
          <section className="space-y-4">
            {pagedPairs.map((pair, index) => (
              <Card key={`${pair.left.id.toString()}-${pair.right.id.toString()}`} className="border-border/70 bg-card/95 shadow-sm">
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Pair #{start + index + 1}</Badge>
                    <Badge variant="outline" className="border-cyan-300/70 bg-cyan-100 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-500/20 dark:text-cyan-200">
                      DOI + Judul Sama
                    </Badge>
                  </div>
                  <CardDescription>
                    Pilih card yang ingin dihapus. Reference di card sebelah akan tetap disimpan.
                  </CardDescription>
                </CardHeader>

                <CardContent className="grid gap-4 md:grid-cols-2">
                  <PairReferenceCard side="left" pair={pair} page={page} pageSize={pageSize} />
                  <PairReferenceCard side="right" pair={pair} page={page} pageSize={pageSize} />
                </CardContent>
              </Card>
            ))}
          </section>
        )}

        {totalPairs > 0 ? (
          <Card className="border-border/70 bg-card/95 shadow-sm">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Halaman {page} dari {pageCount}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {page <= 1 ? (
                  <Button variant="outline" size="sm" disabled>
                    Paling awal
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildDeduplicatePath({ page: 1, pageSize })}>Paling awal</Link>
                  </Button>
                )}

                {page <= 1 ? (
                  <Button variant="outline" size="sm" disabled>
                    Sebelumnya
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildDeduplicatePath({ page: Math.max(1, page - 1), pageSize })}>
                      Sebelumnya
                    </Link>
                  </Button>
                )}

                {page >= pageCount ? (
                  <Button variant="outline" size="sm" disabled>
                    Berikutnya
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildDeduplicatePath({ page: Math.min(pageCount, page + 1), pageSize })}>
                      Berikutnya
                    </Link>
                  </Button>
                )}

                {page >= pageCount ? (
                  <Button variant="outline" size="sm" disabled>
                    Paling akhir
                  </Button>
                ) : (
                  <Button asChild variant="outline" size="sm">
                    <Link href={buildDeduplicatePath({ page: pageCount, pageSize })}>Paling akhir</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
