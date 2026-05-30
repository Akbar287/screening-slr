import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { ResultStatus } from "@/generated/prisma/client";
import { authOptions } from "@/lib/auth-options";
import { serializeBibTeX } from "@/lib/bibtex";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function parseStatus(value: string | null): ResultStatus | null {
  if (value === ResultStatus.Included) {
    return ResultStatus.Included;
  }

  if (value === ResultStatus.Excluded) {
    return ResultStatus.Excluded;
  }

  return null;
}

function buildFileName(status: ResultStatus): string {
  const label = status.toLowerCase();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `full-text-analysis-${label}-${stamp}.bib`;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = parseUserId(session?.user?.id);

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const status = parseStatus(new URL(request.url).searchParams.get("status"));

  if (!status) {
    return NextResponse.json(
      { message: "Parameter status harus Included atau Excluded." },
      { status: 400 },
    );
  }

  const resultRows = await prisma.resultFullText.findMany({
    where: {
      hasil: status,
      fullText: {
        result: {
          references: {
            userId,
          },
        },
      },
    },
    orderBy: [{ fullTextId: "asc" }, { id: "desc" }],
    select: {
      fullText: {
        select: {
          result: {
            select: {
              references: {
                select: {
                  id: true,
                  citationKey: true,
                  entryType: true,
                  title: true,
                  year: true,
                  month: true,
                  journal: true,
                  booktitle: true,
                  publisher: true,
                  institution: true,
                  organization: true,
                  school: true,
                  volume: true,
                  number: true,
                  series: true,
                  edition: true,
                  chapter: true,
                  pages: true,
                  address: true,
                  doi: true,
                  isbn: true,
                  issn: true,
                  url: true,
                  urldate: true,
                  note: true,
                  abstract: true,
                  keywords: true,
                  language: true,
                  type: true,
                  howpublished: true,
                  crossref: true,
                  eprint: true,
                  archivePrefix: true,
                  primaryClass: true,
                  pmid: true,
                  pmcid: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (resultRows.length === 0) {
    return NextResponse.json(
      { message: `Belum ada references full-text dengan hasil ${status}.` },
      { status: 404 },
    );
  }

  const uniqueByReferenceId = new Map<
    string,
    (typeof resultRows)[number]["fullText"]["result"]["references"]
  >();

  for (const row of resultRows) {
    const reference = row.fullText.result.references;
    const referenceId = reference.id.toString();

    if (!uniqueByReferenceId.has(referenceId)) {
      uniqueByReferenceId.set(referenceId, reference);
    }
  }

  const references = Array.from(uniqueByReferenceId.values());

  const bibText = serializeBibTeX(
    references.map((reference) => ({
      entryType: reference.entryType,
      citationKey: reference.citationKey,
      fields: {
        title: reference.title,
        year: reference.year,
        month: reference.month,
        journal: reference.journal,
        booktitle: reference.booktitle,
        publisher: reference.publisher,
        institution: reference.institution,
        organization: reference.organization,
        school: reference.school,
        volume: reference.volume,
        number: reference.number,
        series: reference.series,
        edition: reference.edition,
        chapter: reference.chapter,
        pages: reference.pages,
        address: reference.address,
        doi: reference.doi,
        isbn: reference.isbn,
        issn: reference.issn,
        url: reference.url,
        urldate: reference.urldate,
        note: reference.note,
        abstract: reference.abstract,
        keywords: reference.keywords,
        language: reference.language,
        type: reference.type,
        howpublished: reference.howpublished,
        crossref: reference.crossref,
        eprint: reference.eprint,
        archiveprefix: reference.archivePrefix,
        primaryclass: reference.primaryClass,
        pmid: reference.pmid,
        pmcid: reference.pmcid,
      },
    })),
  );

  return new Response(bibText, {
    status: 200,
    headers: {
      "Content-Type": "text/x-bibtex; charset=utf-8",
      "Content-Disposition": `attachment; filename="${buildFileName(status)}"`,
      "Cache-Control": "no-store",
    },
  });
}
