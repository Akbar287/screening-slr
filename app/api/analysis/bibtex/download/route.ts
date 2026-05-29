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
  return `analysis-${label}-${stamp}.bib`;
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

  const resultRows = await prisma.result.findMany({
    where: {
      hasil: status,
      references: {
        userId,
      },
    },
    orderBy: [{ referencesId: "asc" }],
    select: {
      references: {
        select: {
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
  });

  if (resultRows.length === 0) {
    return NextResponse.json(
      { message: `Belum ada references dengan hasil ${status}.` },
      { status: 404 },
    );
  }

  const bibText = serializeBibTeX(
    resultRows.map((row) => ({
      entryType: row.references.entryType,
      citationKey: row.references.citationKey,
      fields: {
        title: row.references.title,
        year: row.references.year,
        month: row.references.month,
        journal: row.references.journal,
        booktitle: row.references.booktitle,
        publisher: row.references.publisher,
        institution: row.references.institution,
        organization: row.references.organization,
        school: row.references.school,
        volume: row.references.volume,
        number: row.references.number,
        series: row.references.series,
        edition: row.references.edition,
        chapter: row.references.chapter,
        pages: row.references.pages,
        address: row.references.address,
        doi: row.references.doi,
        isbn: row.references.isbn,
        issn: row.references.issn,
        url: row.references.url,
        urldate: row.references.urldate,
        note: row.references.note,
        abstract: row.references.abstract,
        keywords: row.references.keywords,
        language: row.references.language,
        type: row.references.type,
        howpublished: row.references.howpublished,
        crossref: row.references.crossref,
        eprint: row.references.eprint,
        archiveprefix: row.references.archivePrefix,
        primaryclass: row.references.primaryClass,
        pmid: row.references.pmid,
        pmcid: row.references.pmcid,
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
