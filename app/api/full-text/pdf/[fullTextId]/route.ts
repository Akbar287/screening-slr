import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";
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

function parseBigIntId(value: string): bigint | null {
  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function normalizePdfFileName(fileName: string | null | undefined): string {
  const normalized = fileName?.trim() || "full-text";
  const safe = normalized.replace(/["\\\r\n]/g, "_");

  if (safe.toLowerCase().endsWith(".pdf")) {
    return safe;
  }

  return `${safe}.pdf`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fullTextId: string }> },
) {
  const session = await getServerSession(authOptions);
  const userId = parseUserId(session?.user?.id);

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { fullTextId: fullTextIdParam } = await params;
  const fullTextId = parseBigIntId(fullTextIdParam);

  if (!fullTextId) {
    return NextResponse.json({ message: "ID full-text tidak valid." }, { status: 400 });
  }

  const fullText = await prisma.fullText.findFirst({
    where: {
      id: fullTextId,
      result: {
        references: {
          userId,
        },
      },
    },
    select: {
      namaFile: true,
      filePdf: true,
    },
  });

  if (!fullText) {
    return NextResponse.json({ message: "File PDF tidak ditemukan." }, { status: 404 });
  }

  if (!fullText.filePdf || fullText.filePdf.byteLength === 0) {
    return NextResponse.json({ message: "Konten PDF kosong." }, { status: 404 });
  }

  const filename = normalizePdfFileName(fullText.namaFile);

  return new Response(fullText.filePdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
