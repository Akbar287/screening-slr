import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { parseBibTeX } from "@/lib/bibtex";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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

function toNullableString(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function truncateString(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  const raw = toNullableString(value);
  if (!raw) {
    return null;
  }

  return raw.length > maxLength ? raw.slice(0, maxLength) : raw;
}

function toNullableYear(value: string | null | undefined): number | null {
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

function toNullableDate(value: string | null | undefined): Date | null {
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
    entryType: truncateString(entryType, 50) ?? entryType,
    title: pickBibField(entry.fields, ["title"]),
    year: toNullableYear(entry.fields.year ?? null),
    month: truncateString(pickBibField(entry.fields, ["month"]), 20),
    journal: pickBibField(entry.fields, ["journal"]),
    booktitle: pickBibField(entry.fields, ["booktitle"]),
    publisher: pickBibField(entry.fields, ["publisher"]),
    institution: pickBibField(entry.fields, ["institution"]),
    organization: pickBibField(entry.fields, ["organization"]),
    school: pickBibField(entry.fields, ["school"]),
    volume: truncateString(pickBibField(entry.fields, ["volume"]), 50),
    number: truncateString(pickBibField(entry.fields, ["number"]), 50),
    series: pickBibField(entry.fields, ["series"]),
    edition: truncateString(pickBibField(entry.fields, ["edition"]), 100),
    chapter: truncateString(pickBibField(entry.fields, ["chapter"]), 100),
    pages: truncateString(pickBibField(entry.fields, ["pages"]), 100),
    address: pickBibField(entry.fields, ["address"]),
    doi: pickBibField(entry.fields, ["doi"]),
    isbn: truncateString(pickBibField(entry.fields, ["isbn"]), 50),
    issn: truncateString(pickBibField(entry.fields, ["issn"]), 50),
    url: pickBibField(entry.fields, ["url"]),
    urldate: toNullableDate(rawUrldate),
    note: pickBibField(entry.fields, ["note"]),
    abstract: pickBibField(entry.fields, ["abstract"]),
    keywords: pickBibField(entry.fields, ["keywords"]),
    language: truncateString(pickBibField(entry.fields, ["language", "langid"]), 50),
    type: truncateString(pickBibField(entry.fields, ["type"]), 100),
    howpublished: pickBibField(entry.fields, ["howpublished"]),
    crossref: pickBibField(entry.fields, ["crossref"]),
    eprint: pickBibField(entry.fields, ["eprint"]),
    archivePrefix: truncateString(pickBibField(entry.fields, ["archiveprefix", "archive_prefix"]), 100),
    primaryClass: truncateString(pickBibField(entry.fields, ["primaryclass", "primary_class"]), 100),
    pmid: truncateString(pickBibField(entry.fields, ["pmid"]), 50),
    pmcid: truncateString(pickBibField(entry.fields, ["pmcid"]), 50),
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

function fileFromFormEntry(entry: FormDataEntryValue): File | null {
  if (!(entry instanceof File)) {
    return null;
  }

  if (entry.size <= 0) {
    return null;
  }

  return entry;
}

function getBibFilesFromFormData(formData: FormData): File[] {
  const files: File[] = [];

  const namedCandidates = [
    ...formData.getAll("bibFiles"),
    ...formData.getAll("bibFiles[]"),
  ];

  for (const candidate of namedCandidates) {
    const file = fileFromFormEntry(candidate);
    if (file) {
      files.push(file);
    }
  }

  if (files.length > 0) {
    return files;
  }

  for (const [key, value] of formData.entries()) {
    if (key !== "bibFiles" && key !== "bibFiles[]") {
      continue;
    }

    const file = fileFromFormEntry(value);
    if (file) {
      files.push(file);
    }
  }

  return files;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = parseUserId(session?.user?.id);

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch (error) {
    console.error("BibTeX import: invalid form data", error);
    return NextResponse.json({ message: "Payload upload tidak valid." }, { status: 400 });
  }

  const uploadedFiles = getBibFilesFromFormData(formData);

  if (uploadedFiles.length === 0) {
    return NextResponse.json(
      { message: "Tidak ada file .bib yang diterima." },
      { status: 400 },
    );
  }

  const mappedEntries: ReferenceMutationData[] = [];
  let processedFileCount = 0;

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
    processedFileCount += 1;

    for (const entry of parsedEntries) {
      const mappedData = mapBibEntryToReferenceData(entry);
      if (mappedData) {
        mappedEntries.push(mappedData);
      }
    }
  }

  if (processedFileCount === 0) {
    return NextResponse.json(
      { message: "Semua file diabaikan karena bukan .bib atau kosong." },
      { status: 400 },
    );
  }

  const chunkedEntries = chunkArray(mappedEntries, 100);
  let createdCount = 0;

  for (const chunk of chunkedEntries) {
    const result = await prisma.bibReference.createMany({
      data: chunk.map((mappedData) => ({
        userId,
        ...mappedData,
      })),
    });

    createdCount += result.count;
  }

  return NextResponse.json({
    message: "Import BibTeX berhasil.",
    receivedFiles: uploadedFiles.length,
    processedBibFiles: processedFileCount,
    createdEntries: createdCount,
  });
}
