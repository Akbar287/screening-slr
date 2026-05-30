import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PageMotion } from "@/app/components/page-motion";
import {
  type IncludedReferenceUploadRow,
  UploadFileWorkbench,
} from "@/app/upload-file/upload-file-workbench";
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
import { createPageMetadata } from "@/lib/seo";

const DEFAULT_PAGE_SIZE = 10;
const ALLOWED_PAGE_SIZES = [10, 20, 40] as const;

export const metadata = createPageMetadata({
  title: "Upload Full-Text PDF",
  description:
    "Upload satu file PDF untuk setiap reference Included sebelum tahap analisa full-text.",
  path: "/upload-file",
  keywords: ["upload full-text", "pdf references", "convert pdf to markdown"],
  noIndex: true,
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type UploadFilePageProps = {
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

function buildUploadFilePath({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): string {
  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, page)));
  params.set("pageSize", String(resolvePageSize(pageSize)));
  return `/upload-file?${params.toString()}`;
}

export default async function UploadFilePage({ searchParams }: UploadFilePageProps) {
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

  const includedResultWhere = {
    hasil: "Included" as const,
    references: {
      userId,
    },
  };

  const totalIncludedReferences = await prisma.result.count({
    where: includedResultWhere,
  });

  const uploadedIncludedReferences = await prisma.result.count({
    where: {
      ...includedResultWhere,
      fullText: {
        some: {},
      },
    },
  });

  const totalStoredFiles = await prisma.fullText.count({
    where: {
      result: {
        hasil: "Included",
        references: {
          userId,
        },
      },
    },
  });

  const pageCount = Math.max(1, Math.ceil(totalIncludedReferences / pageSize));
  const page = requestedPage > pageCount ? pageCount : requestedPage;

  if (page !== requestedPage) {
    redirect(
      buildUploadFilePath({
        page,
        pageSize,
      }),
    );
  }

  const includedResults = await prisma.result.findMany({
    where: includedResultWhere,
    orderBy: [{ id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      id: true,
      _count: {
        select: {
          fullText: true,
        },
      },
      fullText: {
        take: 1,
        orderBy: [{ updatedAt: "desc" }],
        select: {
          id: true,
          namaFile: true,
          updatedAt: true,
        },
      },
      references: {
        select: {
          id: true,
          citationKey: true,
          title: true,
          doi: true,
          year: true,
          journal: true,
          publisher: true,
        },
      },
    },
  });

  const rows: IncludedReferenceUploadRow[] = includedResults.map((item) => ({
    resultId: item.id.toString(),
    referenceId: item.references.id.toString(),
    citationKey: item.references.citationKey,
    title: item.references.title,
    doi: item.references.doi,
    year: item.references.year,
    journal: item.references.journal,
    publisher: item.references.publisher,
    uploadedFilesCount: item._count.fullText,
    uploadedFiles: item.fullText.map((file) => ({
      id: file.id.toString(),
      namaFile: file.namaFile,
      updatedAt: file.updatedAt.toISOString(),
    })),
  }));

  const remainingReferences = Math.max(0, totalIncludedReferences - uploadedIncludedReferences);

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-100 px-6 py-10 dark:bg-zinc-950">
      <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-sky-300/25 blur-3xl dark:bg-sky-500/20" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl dark:bg-emerald-500/20" />

      <main className="mx-auto flex max-w-7xl flex-col gap-6 py-4">
        <PageMotion>
          <Card className="border-border/70 bg-card/95 shadow-xl">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <Badge variant="secondary" className="uppercase tracking-[0.2em]">
                  Tahap 1
                </Badge>
                <CardTitle className="text-3xl">Upload Full Text PDF (Included)</CardTitle>
                <CardDescription>
                  Halaman ini fokus untuk upload file full-text. Setiap reference hanya boleh
                  memiliki <strong>1 file PDF aktif</strong>. Sistem akan konversi ke Markdown
                  menggunakan <code>@pdf2md/core</code> lalu simpan ke database.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/full-text-screening">Lanjut ke Analisa Full-Text</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                  <Link href="/">Kembali ke Dashboard</Link>
                </Button>
              </div>
            </CardHeader>
          </Card>
        </PageMotion>

        <section className="grid gap-3 sm:grid-cols-3">
          <Card className="border-border/70 bg-card/95 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Total Included</CardTitle>
              <p className="text-3xl font-bold">{totalIncludedReferences}</p>
            </CardHeader>
          </Card>
          <Card className="border-border/70 bg-card/95 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Sudah Upload</CardTitle>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-300">
                {uploadedIncludedReferences}
              </p>
            </CardHeader>
          </Card>
          <Card className="border-border/70 bg-card/95 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Belum Upload</CardTitle>
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-300">
                {remainingReferences}
              </p>
              <p className="text-xs text-muted-foreground">
                Total file Markdown tersimpan: {totalStoredFiles}
              </p>
            </CardHeader>
          </Card>
        </section>

        <UploadFileWorkbench
          rows={rows}
          totalRows={totalIncludedReferences}
          page={page}
          pageSize={pageSize}
        />
      </main>
    </div>
  );
}
