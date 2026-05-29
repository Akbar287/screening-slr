import Image from "next/image";
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
import { Input } from "@/components/ui/input";
import { authOptions } from "@/lib/auth-options";
import { CRITERIA_KIND_CONFIG, type CriteriaKind } from "@/lib/criteria-kind";
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

function parseUrutan(value: FormDataEntryValue | null): number | null {
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return parsed;
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

async function getAuthenticatedUserId(): Promise<bigint> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  try {
    return BigInt(userId);
  } catch {
    redirect("/login");
  }
}

async function getTypeCriteriaByKind(kind: CriteriaKind) {
  const config = CRITERIA_KIND_CONFIG[kind];

  return prisma.typeCriteria.findFirst({
    where: {
      OR: config.aliases.map((alias) => ({
        nama: {
          equals: alias,
          mode: "insensitive",
        },
      })),
    },
    select: {
      id: true,
      nama: true,
      deskripsi: true,
      logo: true,
    },
    orderBy: {
      id: "asc",
    },
  });
}

export async function CriteriaCrudPage({ kind }: { kind: CriteriaKind }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = BigInt(session.user.id);
  const config = CRITERIA_KIND_CONFIG[kind];
  const typeCriteria = await getTypeCriteriaByKind(kind);

  const criteriaRows = typeCriteria
    ? await prisma.criteria.findMany({
        where: {
          userId,
          typeCriteriaId: typeCriteria.id,
        },
        orderBy: [{ urutan: "asc" }, { id: "asc" }],
      })
    : [];

  async function createCriteria(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    const currentTypeCriteria = await getTypeCriteriaByKind(kind);

    if (!currentTypeCriteria) {
      return;
    }

    const nama = String(formData.get("nama") ?? "").trim();
    if (!nama) {
      return;
    }

    const urutan = parseUrutan(formData.get("urutan"));

    await prisma.criteria.create({
      data: {
        nama,
        urutan,
        userId: currentUserId,
        typeCriteriaId: currentTypeCriteria.id,
      },
    });

    revalidatePath(config.route);
  }

  async function updateCriteria(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    const currentTypeCriteria = await getTypeCriteriaByKind(kind);

    if (!currentTypeCriteria) {
      return;
    }

    const criteriaId = parseBigIntValue(formData.get("criteriaId"));
    if (!criteriaId) {
      return;
    }

    const nama = String(formData.get("nama") ?? "").trim();
    if (!nama) {
      return;
    }

    const urutan = parseUrutan(formData.get("urutan"));

    await prisma.criteria.updateMany({
      where: {
        id: criteriaId,
        userId: currentUserId,
        typeCriteriaId: currentTypeCriteria.id,
      },
      data: {
        nama,
        urutan,
      },
    });

    revalidatePath(config.route);
  }

  async function deleteCriteria(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    const currentTypeCriteria = await getTypeCriteriaByKind(kind);

    if (!currentTypeCriteria) {
      return;
    }

    const criteriaId = parseBigIntValue(formData.get("criteriaId"));
    if (!criteriaId) {
      return;
    }

    await prisma.criteria.deleteMany({
      where: {
        id: criteriaId,
        userId: currentUserId,
        typeCriteriaId: currentTypeCriteria.id,
      },
    });

    revalidatePath(config.route);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background px-6 py-10">
      <div className="pointer-events-none absolute -left-16 -top-16 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/20" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-lime-300/20 blur-3xl dark:bg-lime-500/15" />

      <main className="mx-auto flex max-w-5xl flex-col gap-6 py-4">
        <PageMotion>
          <Card className="border-border/70 bg-card/95 shadow-xl">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4">
                {typeCriteria?.logo ? (
                  <Image
                    src={toSvgBase64DataUri(typeCriteria.logo) ?? ""}
                    alt={`Logo ${typeCriteria.nama}`}
                    width={56}
                    height={56}
                    unoptimized
                    className="h-14 w-14 rounded-xl border border-border bg-muted object-contain p-2"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-muted text-xs font-bold uppercase text-muted-foreground">
                    N/A
                  </div>
                )}

                <div className="space-y-2">
                  <Badge variant="secondary" className="uppercase tracking-[0.2em]">
                    Kelola Criteria
                  </Badge>
                  <CardTitle className="text-3xl">{typeCriteria?.nama ?? config.displayName}</CardTitle>
                  <CardDescription>
                    {typeCriteria?.deskripsi?.trim() ?? "Deskripsi belum tersedia."}
                  </CardDescription>
                </div>
              </div>

              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/">Kembali ke Dashboard</Link>
              </Button>
            </CardHeader>
          </Card>
        </PageMotion>

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Tambah Criteria</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createCriteria} className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
              <Input type="text" name="nama" required placeholder="Nama criteria" />
              <Input type="number" name="urutan" placeholder="Urutan" />
              <Button type="submit">Tambah</Button>
            </form>

            {!typeCriteria ? (
              <p className="mt-4 rounded-lg border border-amber-300/60 bg-amber-100/60 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                Data TypeCriteria untuk halaman ini belum ditemukan. Pastikan nama TypeCriteria sesuai
                ({CRITERIA_KIND_CONFIG[kind].aliases.join(", ")}).
              </p>
            ) : null}
          </CardContent>
        </Card>

        <section className="space-y-3">
          {criteriaRows.length === 0 ? (
            <Card className="border-dashed border-border/80 bg-card/95">
              <CardContent className="p-5 text-sm text-muted-foreground">Belum ada data criteria.</CardContent>
            </Card>
          ) : null}

          {criteriaRows.map((item) => (
            <Card key={item.id.toString()} className="border-border/70 bg-card/95 shadow-sm">
              <CardContent className="p-5">
                <form action={updateCriteria} className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
                  <input type="hidden" name="criteriaId" value={item.id.toString()} />
                  <Input type="text" name="nama" required defaultValue={item.nama} />
                  <Input type="number" name="urutan" defaultValue={item.urutan ?? ""} />
                  <Button type="submit" variant="secondary">
                    Simpan
                  </Button>
                </form>

                <form action={deleteCriteria} className="mt-3">
                  <input type="hidden" name="criteriaId" value={item.id.toString()} />
                  <Button type="submit" variant="destructive" size="sm">
                    Hapus
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
