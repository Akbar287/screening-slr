import Link from "next/link";
import Image from "next/image";
import { getServerSession } from "next-auth";
import { BibtexAiAnalysisCard } from "@/app/components/bibtex-ai-analysis-card";
import { PageMotion } from "@/app/components/page-motion";
import { SignOutButton } from "@/app/components/sign-out-button";
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
import {
  CRITERIA_KIND_CONFIG,
  CRITERIA_KIND_ORDER,
  matchesCriteriaAlias,
} from "@/lib/criteria-kind";
import { getSupportedAiModels } from "@/lib/ai-models";
import { prisma } from "@/lib/prisma";

function toSvgBase64DataUri(logo: string | null | undefined): string | null {
  const trimmedLogo = logo?.trim();

  if (!trimmedLogo) {
    return null;
  }

  if (trimmedLogo.startsWith("data:image/svg+xml;base64,")) {
    return trimmedLogo;
  }

  return `data:image/svg+xml;base64,${trimmedLogo}`;
}

function parseSessionUserId(userId: string | null | undefined): bigint | null {
  if (!userId) {
    return null;
  }

  try {
    return BigInt(userId);
  } catch {
    return null;
  }
}

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-zinc-100 px-6 py-10 dark:bg-zinc-950">
        <div className="pointer-events-none absolute -left-20 -top-16 h-72 w-72 rounded-full bg-cyan-300/35 blur-3xl dark:bg-cyan-500/20" />
        <div className="pointer-events-none absolute -right-16 top-20 h-72 w-72 rounded-full bg-lime-300/30 blur-3xl dark:bg-lime-500/15" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-500/15" />

        <main className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-12 py-16">
          <PageMotion className="w-full">
            <Card className="w-full border-border/70 bg-card/95 shadow-2xl backdrop-blur">
              <CardHeader className="space-y-4">
                <Badge variant="secondary" className="w-fit uppercase tracking-[0.2em]">
                  Screening ALR
                </Badge>
                <CardTitle className="max-w-2xl text-4xl font-black leading-tight sm:text-5xl">
                  Platform Seleksi Referensi untuk Systematic Literature Review
                </CardTitle>
                <CardDescription className="max-w-2xl text-base leading-relaxed sm:text-lg">
                  Kelola proses screening artikel dengan alur yang lebih rapi: simpan referensi,
                  nilai kriteria, dan catat justifikasi keputusan.
                </CardDescription>
              </CardHeader>

              <CardContent>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button asChild size="lg">
                    <Link href="/login">Login</Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href="/register">Register</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </PageMotion>
        </main>
      </div>
    );
  }

  const currentUserId = parseSessionUserId(session.user?.id);

  const typeCriteriaRows = await prisma.typeCriteria.findMany({
    select: {
      id: true,
      nama: true,
      deskripsi: true,
      logo: true,
    },
  });

  const criteriaCountRows = currentUserId
    ? await prisma.criteria.groupBy({
        by: ["typeCriteriaId"],
        where: {
          userId: currentUserId,
        },
        _count: {
          _all: true,
        },
      })
    : [];

  const referencesCount = currentUserId
    ? await prisma.bibReference.count({
        where: {
          userId: currentUserId,
        },
      })
    : 0;

  const analyzedReferencesCount = currentUserId
    ? await prisma.result.count({
        where: {
          references: {
            userId: currentUserId,
          },
        },
      })
    : 0;

  const includedResultsCount = currentUserId
    ? await prisma.result.count({
        where: {
          hasil: "Included",
          references: {
            userId: currentUserId,
          },
        },
      })
    : 0;

  const excludedResultsCount = currentUserId
    ? await prisma.result.count({
        where: {
          hasil: "Excluded",
          references: {
            userId: currentUserId,
          },
        },
      })
    : 0;

  const aiModels = getSupportedAiModels();
  const defaultAiModel = aiModels[0] ?? "openai/gpt-5.5";

  const criteriaCountByTypeId = new Map(
    criteriaCountRows.map((row) => [row.typeCriteriaId.toString(), row._count._all]),
  );

  const criteriaCards = CRITERIA_KIND_ORDER.map((kind) => {
    const config = CRITERIA_KIND_CONFIG[kind];
    const matchedCriteria = typeCriteriaRows.find((row) =>
      matchesCriteriaAlias(row.nama, config.aliases),
    );
    const criteriaCount = matchedCriteria
      ? (criteriaCountByTypeId.get(matchedCriteria.id.toString()) ?? 0)
      : 0;

    return {
      nama: matchedCriteria?.nama ?? config.displayName,
      deskripsi: matchedCriteria?.deskripsi?.trim() ?? "Deskripsi belum tersedia.",
      logoSrc: toSvgBase64DataUri(matchedCriteria?.logo),
      isConfigured: Boolean(matchedCriteria),
      criteriaCount,
      route: config.route,
      displayName: config.displayName,
    };
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-zinc-100 px-6 py-10 dark:bg-zinc-950">
      <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-emerald-300/35 blur-3xl dark:bg-emerald-500/20" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-500/20" />

      <main className="mx-auto flex max-w-5xl flex-col gap-8 py-6">
        <PageMotion>
          <Card className="border-border/70 bg-card/95 shadow-xl">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <Badge variant="secondary" className="uppercase tracking-[0.2em]">
                  Selamat Datang
                </Badge>
                <CardTitle className="text-3xl font-bold">
                  Halo, {session.user?.name ?? "Pengguna"}
                </CardTitle>
                <CardDescription>
                  Kamu sudah login. Lanjutkan proses screening referensi dari dashboard ini.
                </CardDescription>
              </div>
              <SignOutButton />
            </CardHeader>
          </Card>
        </PageMotion>

        <section className="grid gap-4 md:grid-cols-2">
          {criteriaCards.map((card) => (
            <Card
              key={card.nama}
              className="relative border-border/70 bg-card/95 shadow-sm"
            >
              <Badge variant="outline" className="absolute right-4 top-4 border-cyan-300/70 bg-cyan-100 text-cyan-800 dark:border-cyan-500/50 dark:bg-cyan-500/20 dark:text-cyan-200">
                {card.criteriaCount} Criteria
              </Badge>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                {card.logoSrc ? (
                  <Image
                    src={card.logoSrc}
                    alt={`Logo ${card.nama}`}
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-xl border border-zinc-200 bg-zinc-50 object-contain p-2 dark:border-zinc-700 dark:bg-zinc-800"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-xs font-bold uppercase text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    N/A
                  </div>
                )}

                <div className="space-y-2">
                  <h2 className="text-xl font-bold">{card.nama}</h2>
                  <p className="text-sm leading-relaxed text-muted-foreground">{card.deskripsi}</p>
                </div>
              </div>

              {!card.isConfigured ? (
                <p className="mt-4 rounded-lg border border-amber-300/60 bg-amber-100/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                  Data {card.displayName} belum ditemukan di tabel TypeCriteria.
                </p>
              ) : null}

              <div className="mt-5">
                <Button asChild variant="outline" className="border-cyan-400/50 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200 dark:hover:bg-cyan-500/20">
                  <Link href={card.route}>Kelola Criteria</Link>
                </Button>
              </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section>
          <Card className="relative border-border/70 bg-card/95 shadow-sm">
            <Badge variant="outline" className="absolute right-4 top-4 border-emerald-300/70 bg-emerald-100 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-500/20 dark:text-emerald-200">
              {referencesCount} References
            </Badge>

            <CardContent className="space-y-2 p-6">
              <h2 className="text-xl font-bold">Bib References</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Kelola daftar referensi dan upload file BibTeX (`.bib`) untuk impor otomatis.
              </p>
            </CardContent>

            <div className="px-6 pb-6">
              <Button asChild variant="outline" className="border-emerald-400/60 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20">
                <Link href="/references">Kelola References</Link>
              </Button>
            </div>
          </Card>
        </section>

        <section>
          <BibtexAiAnalysisCard
            models={aiModels}
            defaultModel={defaultAiModel}
            totalReferences={referencesCount}
            analyzedReferences={analyzedReferencesCount}
            includedResultsCount={includedResultsCount}
            excludedResultsCount={excludedResultsCount}
          />
        </section>
      </main>
    </div>
  );
}
