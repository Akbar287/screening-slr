import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

type UpdateReferencePayload = {
  citationKey?: unknown;
  entryType?: unknown;
  title?: unknown;
  year?: unknown;
  journal?: unknown;
  publisher?: unknown;
  doi?: unknown;
  url?: unknown;
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

function parseReferenceId(value: string): bigint | null {
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

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toRequiredString(value: unknown): string | null {
  const normalized = toNullableString(value);
  return normalized && normalized.length > 0 ? normalized : null;
}

function toNullableYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.trunc(value);

    if (rounded >= -32768 && rounded <= 32767) {
      return rounded;
    }

    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const matched = normalized.match(/-?\d{1,4}/);
  if (!matched) {
    return null;
  }

  const parsed = Number.parseInt(matched[0], 10);
  if (Number.isNaN(parsed) || parsed < -32768 || parsed > 32767) {
    return null;
  }

  return parsed;
}

async function getAuthenticatedUserId(): Promise<bigint | null> {
  const session = await getServerSession(authOptions);
  return parseUserId(session?.user?.id);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const referenceId = parseReferenceId(id);

  if (!referenceId) {
    return NextResponse.json({ message: "ID reference tidak valid." }, { status: 400 });
  }

  let body: UpdateReferencePayload;

  try {
    body = (await request.json()) as UpdateReferencePayload;
  } catch {
    return NextResponse.json(
      { message: "Payload tidak valid. Gunakan JSON yang benar." },
      { status: 400 },
    );
  }

  const citationKey = toRequiredString(body.citationKey);
  const entryType = toRequiredString(body.entryType);

  if (!citationKey || !entryType) {
    return NextResponse.json(
      { message: "Field citationKey dan entryType wajib diisi." },
      { status: 400 },
    );
  }

  const ownedReference = await prisma.bibReference.findFirst({
    where: {
      id: referenceId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!ownedReference) {
    return NextResponse.json({ message: "Reference tidak ditemukan." }, { status: 404 });
  }

  try {
    const updated = await prisma.bibReference.update({
      where: {
        id: referenceId,
      },
      data: {
        citationKey,
        entryType,
        title: toNullableString(body.title),
        year: toNullableYear(body.year),
        journal: toNullableString(body.journal),
        publisher: toNullableString(body.publisher),
        doi: toNullableString(body.doi),
        url: toNullableString(body.url),
      },
      select: {
        id: true,
      },
    });

    return NextResponse.json({
      message: "Reference berhasil diperbarui.",
      id: updated.id.toString(),
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { message: "Citation key sudah digunakan pada akun Anda." },
        { status: 409 },
      );
    }

    console.error("PATCH /api/references/[id] failed:", error);
    return NextResponse.json({ message: "Gagal memperbarui reference." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getAuthenticatedUserId();

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const { id } = await params;
  const referenceId = parseReferenceId(id);

  if (!referenceId) {
    return NextResponse.json({ message: "ID reference tidak valid." }, { status: 400 });
  }

  const deleted = await prisma.bibReference.deleteMany({
    where: {
      id: referenceId,
      userId,
    },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ message: "Reference tidak ditemukan." }, { status: 404 });
  }

  return NextResponse.json({ message: "Reference berhasil dihapus." });
}
