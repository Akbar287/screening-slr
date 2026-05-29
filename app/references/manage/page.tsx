import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { PageMotion } from "@/app/components/page-motion";
import { BibUploadField } from "@/app/references/bib-upload-field";
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
import { Textarea } from "@/components/ui/textarea";
import { authOptions } from "@/lib/auth-options";
import { parseBibTeX } from "@/lib/bibtex";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

type ReferenceMutationData = {
  citationKey: string;
  entryType: string;
  title?: string | null;
  year?: number | null;
  month?: string | null;
  journal?: string | null;
  booktitle?: string | null;
  publisher?: string | null;
  institution?: string | null;
  organization?: string | null;
  school?: string | null;
  volume?: string | null;
  number?: string | null;
  series?: string | null;
  edition?: string | null;
  chapter?: string | null;
  pages?: string | null;
  address?: string | null;
  doi?: string | null;
  isbn?: string | null;
  issn?: string | null;
  url?: string | null;
  urldate?: Date | null;
  note?: string | null;
  abstract?: string | null;
  keywords?: string | null;
  language?: string | null;
  type?: string | null;
  howpublished?: string | null;
  crossref?: string | null;
  eprint?: string | null;
  archivePrefix?: string | null;
  primaryClass?: string | null;
  pmid?: string | null;
  pmcid?: string | null;
};

function toNullableString(value: FormDataEntryValue | null): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > 0 ? raw : null;
}

function toNullableYear(value: FormDataEntryValue | null): number | null {
  const raw = toNullableString(value);
  if (!raw) {
    return null;
  }

  const match = raw.match(/-?\d{1,4}/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[0], 10);
  if (Number.isNaN(year)) {
    return null;
  }

  if (year < -32768 || year > 32767) {
    return null;
  }

  return year;
}

function toNullableDate(value: FormDataEntryValue | null): Date | null {
  const raw = toNullableString(value);
  if (!raw) {
    return null;
  }

  const fullDateMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (fullDateMatch) {
    const year = Number.parseInt(fullDateMatch[1], 10);
    const month = Number.parseInt(fullDateMatch[2], 10);
    const day = Number.parseInt(fullDateMatch[3], 10);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date;
    }

    return null;
  }

  const yearMonthMatch = raw.match(/^(\d{4})[-/](\d{1,2})$/);
  if (yearMonthMatch) {
    const year = Number.parseInt(yearMonthMatch[1], 10);
    const month = Number.parseInt(yearMonthMatch[2], 10);
    const date = new Date(Date.UTC(year, month - 1, 1));

    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1) {
      return date;
    }

    return null;
  }

  const yearOnlyMatch = raw.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    const year = Number.parseInt(yearOnlyMatch[1], 10);
    return new Date(Date.UTC(year, 0, 1));
  }

  return null;
}

function toOptionalNullableString(
  formData: FormData,
  key: string,
): string | null | undefined {
  if (!formData.has(key)) {
    return undefined;
  }

  return toNullableString(formData.get(key));
}

function toOptionalNullableYear(formData: FormData, key: string): number | null | undefined {
  if (!formData.has(key)) {
    return undefined;
  }

  return toNullableYear(formData.get(key));
}

function toOptionalNullableDate(formData: FormData, key: string): Date | null | undefined {
  if (!formData.has(key)) {
    return undefined;
  }

  return toNullableDate(formData.get(key));
}

function extractReferenceData(formData: FormData): ReferenceMutationData | null {
  const citationKey = toNullableString(formData.get("citationKey"));
  const entryType = toNullableString(formData.get("entryType"));

  if (!citationKey || !entryType) {
    return null;
  }

  return {
    citationKey,
    entryType,
    title: toOptionalNullableString(formData, "title"),
    year: toOptionalNullableYear(formData, "year"),
    month: toOptionalNullableString(formData, "month"),
    journal: toOptionalNullableString(formData, "journal"),
    booktitle: toOptionalNullableString(formData, "booktitle"),
    publisher: toOptionalNullableString(formData, "publisher"),
    institution: toOptionalNullableString(formData, "institution"),
    organization: toOptionalNullableString(formData, "organization"),
    school: toOptionalNullableString(formData, "school"),
    volume: toOptionalNullableString(formData, "volume"),
    number: toOptionalNullableString(formData, "number"),
    series: toOptionalNullableString(formData, "series"),
    edition: toOptionalNullableString(formData, "edition"),
    chapter: toOptionalNullableString(formData, "chapter"),
    pages: toOptionalNullableString(formData, "pages"),
    address: toOptionalNullableString(formData, "address"),
    doi: toOptionalNullableString(formData, "doi"),
    isbn: toOptionalNullableString(formData, "isbn"),
    issn: toOptionalNullableString(formData, "issn"),
    url: toOptionalNullableString(formData, "url"),
    urldate: toOptionalNullableDate(formData, "urldate"),
    note: toOptionalNullableString(formData, "note"),
    abstract: toOptionalNullableString(formData, "abstract"),
    keywords: toOptionalNullableString(formData, "keywords"),
    language: toOptionalNullableString(formData, "language"),
    type: toOptionalNullableString(formData, "type"),
    howpublished: toOptionalNullableString(formData, "howpublished"),
    crossref: toOptionalNullableString(formData, "crossref"),
    eprint: toOptionalNullableString(formData, "eprint"),
    archivePrefix: toOptionalNullableString(formData, "archivePrefix"),
    primaryClass: toOptionalNullableString(formData, "primaryClass"),
    pmid: toOptionalNullableString(formData, "pmid"),
    pmcid: toOptionalNullableString(formData, "pmcid"),
  };
}

function pickBibField(fields: Record<string, string>, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = fields[alias];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function mapBibEntryToReferenceData(entry: {
  entryType: string;
  citationKey: string;
  fields: Record<string, string>;
}): ReferenceMutationData | null {
  const citationKey = entry.citationKey.trim();
  const entryType = entry.entryType.trim();

  if (!citationKey || !entryType) {
    return null;
  }

  const rawUrldate = pickBibField(entry.fields, ["urldate", "date"]);

  return {
    citationKey,
    entryType,
    title: pickBibField(entry.fields, ["title"]),
    year: toNullableYear(entry.fields.year ?? null),
    month: pickBibField(entry.fields, ["month"]),
    journal: pickBibField(entry.fields, ["journal"]),
    booktitle: pickBibField(entry.fields, ["booktitle"]),
    publisher: pickBibField(entry.fields, ["publisher"]),
    institution: pickBibField(entry.fields, ["institution"]),
    organization: pickBibField(entry.fields, ["organization"]),
    school: pickBibField(entry.fields, ["school"]),
    volume: pickBibField(entry.fields, ["volume"]),
    number: pickBibField(entry.fields, ["number"]),
    series: pickBibField(entry.fields, ["series"]),
    edition: pickBibField(entry.fields, ["edition"]),
    chapter: pickBibField(entry.fields, ["chapter"]),
    pages: pickBibField(entry.fields, ["pages"]),
    address: pickBibField(entry.fields, ["address"]),
    doi: pickBibField(entry.fields, ["doi"]),
    isbn: pickBibField(entry.fields, ["isbn"]),
    issn: pickBibField(entry.fields, ["issn"]),
    url: pickBibField(entry.fields, ["url"]),
    urldate: toNullableDate(rawUrldate),
    note: pickBibField(entry.fields, ["note"]),
    abstract: pickBibField(entry.fields, ["abstract"]),
    keywords: pickBibField(entry.fields, ["keywords"]),
    language: pickBibField(entry.fields, ["language", "langid"]),
    type: pickBibField(entry.fields, ["type"]),
    howpublished: pickBibField(entry.fields, ["howpublished"]),
    crossref: pickBibField(entry.fields, ["crossref"]),
    eprint: pickBibField(entry.fields, ["eprint"]),
    archivePrefix: pickBibField(entry.fields, ["archiveprefix", "archive_prefix"]),
    primaryClass: pickBibField(entry.fields, ["primaryclass", "primary_class"]),
    pmid: pickBibField(entry.fields, ["pmid"]),
    pmcid: pickBibField(entry.fields, ["pmcid"]),
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const size = Math.max(1, chunkSize);
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
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

export default async function ManageReferencesPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  async function createReference(formData: FormData) {
    "use server";

    const currentUserId = await getAuthenticatedUserId();
    const data = extractReferenceData(formData);

    if (!data) {
      return;
    }

    await prisma.bibReference.create({
      data: {
        userId: currentUserId,
        ...data,
      },
    });

    revalidatePath("/references");
    redirect("/references");
  }

  async function importBibFile(formData: FormData) {
    "use server";

    try {
      const currentUserId = await getAuthenticatedUserId();
      const uploadedFiles = formData
        .getAll("bibFiles")
        .filter((item): item is File => item instanceof File);

      if (uploadedFiles.length === 0) {
        return;
      }

      const mappedEntries: ReferenceMutationData[] = [];

      for (const file of uploadedFiles) {
        const fileName = file.name?.toLowerCase() ?? "";
        if (!fileName.endsWith(".bib")) {
          continue;
        }

        const content = await file.text();
        if (!content.trim()) {
          continue;
        }

        const parsedEntries = parseBibTeX(content);

        for (const entry of parsedEntries) {
          const mappedData = mapBibEntryToReferenceData(entry);
          if (mappedData) {
            mappedEntries.push(mappedData);
          }
        }
      }

      const chunkedEntries = chunkArray(mappedEntries, 100);

      for (const chunk of chunkedEntries) {
        await prisma.bibReference.createMany({
          data: chunk.map((mappedData) => ({
            userId: currentUserId,
            ...mappedData,
          })),
        });
      }
    } catch (error) {
      console.error("BibTeX import action failed:", error);
    }

    revalidatePath("/references");
    redirect("/references");
  }

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
                  Manage References
                </Badge>
                <CardTitle className="text-3xl">Upload & Tambah Reference</CardTitle>
                <CardDescription>
                  Halaman khusus untuk upload BibTeX dan tambah reference manual.
                </CardDescription>
              </div>

              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/references">Kembali ke Tabel References</Link>
              </Button>
            </CardHeader>
          </Card>
        </PageMotion>

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Upload File BibTeX</CardTitle>
          </CardHeader>
          <CardContent>
            <BibUploadField action={importBibFile} />
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Tambah Reference Manual</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createReference} className="grid gap-3 md:grid-cols-2">
              <Input type="text" name="citationKey" required placeholder="Citation Key (contoh: knuth1990)" />
              <Input type="text" name="entryType" required placeholder="Entry Type (contoh: article, inproceedings)" />
              <Input type="text" name="title" placeholder="Title" />
              <Input type="number" name="year" placeholder="Year" />
              <Input type="text" name="journal" placeholder="Journal" />
              <Input type="text" name="booktitle" placeholder="Booktitle" />
              <Input type="text" name="publisher" placeholder="Publisher" />
              <Input type="text" name="doi" placeholder="DOI" />
              <Input type="url" name="url" placeholder="URL" />
              <Input type="text" name="keywords" placeholder="Keywords" />
              <Textarea name="note" placeholder="Note" rows={3} className="md:col-span-2" />
              <div className="md:col-span-2">
                <Button type="submit">Tambah Reference</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
