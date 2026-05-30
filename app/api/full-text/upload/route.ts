import { convert, MAX_FILE_SIZE } from "@pdf2md/core";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

function parseBigIntString(value: FormDataEntryValue | null): bigint | null {
  if (typeof value !== "string") {
    return null;
  }

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

function fileFromFormEntry(entry: FormDataEntryValue): File | null {
  if (!(entry instanceof File)) {
    return null;
  }

  if (entry.size <= 0) {
    return null;
  }

  return entry;
}

function getPdfFilesFromFormData(formData: FormData): File[] {
  const files: File[] = [];

  const namedCandidates = [
    ...formData.getAll("pdfFiles"),
    ...formData.getAll("pdfFiles[]"),
    formData.get("pdfFile"),
  ];

  for (const candidate of namedCandidates) {
    if (!candidate) {
      continue;
    }

    const file = fileFromFormEntry(candidate);
    if (file) {
      files.push(file);
    }
  }

  if (files.length > 0) {
    return files;
  }

  for (const [key, value] of formData.entries()) {
    if (key !== "pdfFiles" && key !== "pdfFiles[]" && key !== "pdfFile") {
      continue;
    }

    const file = fileFromFormEntry(value);
    if (file) {
      files.push(file);
    }
  }

  return files;
}

function normalizeFileName(file: File): string {
  const name = file.name?.trim();
  if (name && name.length > 0) {
    return name;
  }

  return "uploaded-reference.pdf";
}

function optionalText(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return "-";
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : "-";
}

function buildFallbackMarkdown({
  fileName,
  reference,
  conversion,
}: {
  fileName: string;
  reference: {
    citationKey: string;
    title: string | null;
    doi: string | null;
    year: number | null;
    journal: string | null;
    abstract: string | null;
  };
  conversion: {
    status: "success" | "partial" | "failed";
    messages: Array<{ code: string; severity: "error" | "warning"; message: string }>;
  };
}): string {
  const messageLines =
    conversion.messages.length > 0
      ? conversion.messages.map(
        (item) => `- [${item.severity.toUpperCase()}] (${item.code}) ${item.message}`,
      )
      : ["- Tidak ada pesan detail dari converter."];

  return [
    "# PDF Conversion Fallback",
    "",
    "Sistem tidak menemukan teks yang bisa diekstrak dari file PDF.",
    "Fallback markdown ini dibuat agar file tetap tersimpan di database dan bisa ditinjau manual.",
    "",
    `- File: ${fileName}`,
    `- Conversion Status: ${conversion.status}`,
    "",
    "## Reference Metadata",
    `- Citation Key: ${reference.citationKey}`,
    `- Title: ${optionalText(reference.title)}`,
    `- DOI: ${optionalText(reference.doi)}`,
    `- Year: ${optionalText(reference.year)}`,
    `- Journal: ${optionalText(reference.journal)}`,
    "",
    "## Converter Messages",
    ...messageLines,
    "",
    "## Abstract (dari data reference)",
    reference.abstract?.trim() || "(Tidak ada abstract)",
  ].join("\n");
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
    console.error("Full text upload: invalid form data", error);
    return NextResponse.json({ message: "Payload upload tidak valid." }, { status: 400 });
  }

  const resultId = parseBigIntString(formData.get("resultId"));
  if (!resultId) {
    return NextResponse.json({ message: "Result ID tidak valid." }, { status: 400 });
  }

  const selectedResult = await prisma.result.findFirst({
    where: {
      id: resultId,
      hasil: "Included",
      references: {
        userId,
      },
    },
    select: {
      id: true,
      references: {
        select: {
          citationKey: true,
          title: true,
          doi: true,
          year: true,
          journal: true,
          abstract: true,
        },
      },
    },
  });

  if (!selectedResult) {
    return NextResponse.json(
      { message: "Reference Included tidak ditemukan atau bukan milik Anda." },
      { status: 404 },
    );
  }

  const uploadedFiles = getPdfFilesFromFormData(formData);
  if (uploadedFiles.length === 0) {
    return NextResponse.json(
      { message: "Tidak ada file PDF yang diterima." },
      { status: 400 },
    );
  }

  if (uploadedFiles.length > 1) {
    return NextResponse.json(
      {
        message: "Untuk tahap ini, 1 reference hanya boleh memiliki 1 file PDF.",
      },
      { status: 400 },
    );
  }

  const file = uploadedFiles[0];
  const fileName = normalizeFileName(file);
  const lowerName = fileName.toLowerCase();

  if (!lowerName.endsWith(".pdf")) {
    return NextResponse.json(
      { message: "Format file harus .pdf." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      {
        message: `Ukuran file melebihi batas ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB.`,
      },
      { status: 400 },
    );
  }

  const pdfArrayBuffer = await file.arrayBuffer();
  if (pdfArrayBuffer.byteLength <= 0) {
    return NextResponse.json({ message: "File PDF kosong." }, { status: 400 });
  }

  let markdownText = "";
  let usedFallbackMarkdown = false;

  try {
    const conversion = await convert(pdfArrayBuffer);
    markdownText = conversion.markdown?.trim() ?? "";

    if (!markdownText) {
      markdownText = buildFallbackMarkdown({
        fileName,
        reference: {
          citationKey: selectedResult.references.citationKey,
          title: selectedResult.references.title,
          doi: selectedResult.references.doi,
          year: selectedResult.references.year,
          journal: selectedResult.references.journal,
          abstract: selectedResult.references.abstract,
        },
        conversion: {
          status: conversion.status,
          messages: conversion.messages.map((item) => ({
            code: item.code,
            severity: item.severity,
            message: item.message,
          })),
        },
      });
      usedFallbackMarkdown = true;
    }
  } catch (error) {
    console.error("Failed converting PDF to markdown:", { fileName, error });
    return NextResponse.json(
      { message: "Gagal konversi PDF ke Markdown." },
      { status: 500 },
    );
  }

  const markdownBytes = Buffer.from(markdownText, "utf8");
  const pdfBytes = Buffer.from(pdfArrayBuffer);

  const existingRows = await prisma.fullText.findMany({
    where: {
      resultId: selectedResult.id,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      namaFile: true,
    },
  });

  if (existingRows.length === 0) {
    const created = await prisma.fullText.create({
      data: {
        resultId: selectedResult.id,
        namaFile: fileName,
        fileMd: markdownBytes,
        filePdf: pdfBytes,
      },
      select: {
        id: true,
        namaFile: true,
      },
    });

    return NextResponse.json({
      message: usedFallbackMarkdown
        ? "Upload PDF berhasil, tetapi teks tidak bisa diekstrak. Fallback markdown disimpan."
        : "Upload PDF berhasil. File tersimpan sebagai full-text.",
      summary: {
        mode: "created",
        fullTextId: created.id.toString(),
        namaFile: created.namaFile,
        usedFallbackMarkdown,
      },
    });
  }

  const primary = existingRows[0];
  const duplicateIds = existingRows.slice(1).map((item) => item.id);

  const [updated] = await prisma.$transaction([
    prisma.fullText.update({
      where: {
        id: primary.id,
      },
      data: {
        namaFile: fileName,
        fileMd: markdownBytes,
        filePdf: pdfBytes,
      },
      select: {
        id: true,
        namaFile: true,
      },
    }),
    ...(duplicateIds.length > 0
      ? [
        prisma.fullText.deleteMany({
          where: {
            id: {
              in: duplicateIds,
            },
          },
        }),
      ]
      : []),
  ]);

  return NextResponse.json({
    message: usedFallbackMarkdown
      ? "Upload PDF berhasil diperbarui, tetapi teks tidak bisa diekstrak. Fallback markdown disimpan."
      : "Upload PDF berhasil. File full-text sebelumnya diperbarui.",
    summary: {
      mode: "updated",
      fullTextId: updated.id.toString(),
      namaFile: updated.namaFile,
      removedDuplicateFiles: duplicateIds.length,
      usedFallbackMarkdown,
    },
  });
}
