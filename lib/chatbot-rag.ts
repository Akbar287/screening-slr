import { prisma } from "@/lib/prisma";

type RagDocument = {
  id: string;
  title: string;
  body: string;
  tags: string[];
};

const STATIC_RAG_DOCUMENTS: RagDocument[] = [
  {
    id: "app-overview",
    title: "Ringkasan Aplikasi Screening ALR",
    tags: ["aplikasi", "screening", "alur", "workflow", "fitur"],
    body: [
      "Aplikasi Screening ALR membantu proses seleksi studi untuk Systematic Literature Review (SLR).",
      "Pengguna dapat mengelola inclusion criteria, exclusion criteria, dan bibliografi references berbasis BibTeX.",
      "Tersedia analisa abstrak dan judul menggunakan AI, screening interaktif manual, deduplikasi references, dan analisa full-text.",
      "Output utama screening adalah Included atau Excluded disertai justifikasi yang dapat ditinjau kembali.",
    ].join(" "),
  },
  {
    id: "app-criteria",
    title: "Kriteria Screening",
    tags: ["criteria", "inclusion", "exclusion", "slr"],
    body: [
      "Inclusion criteria adalah syarat agar paper relevan untuk pertanyaan riset.",
      "Exclusion criteria adalah syarat untuk menolak paper yang tidak sesuai.",
      "Kriteria sebaiknya spesifik, terukur, dan konsisten agar keputusan screening bisa direplikasi.",
      "Setiap keputusan idealnya disertai justifikasi singkat agar audit trail SLR tetap jelas.",
    ].join(" "),
  },
  {
    id: "app-references",
    title: "Manajemen BibTeX References",
    tags: ["bibtex", "references", "doi", "judul", "metadata"],
    body: [
      "References dapat ditambahkan manual atau diimpor dari file .bib.",
      "Metadata penting meliputi title, abstract, year, journal, authors, DOI, dan citation key.",
      "Deduplikasi references sebaiknya dilakukan sebelum screening agar tidak menilai paper yang sama dua kali.",
      "DOI biasanya menjadi identifier kuat untuk memverifikasi keunikan paper.",
    ].join(" "),
  },
  {
    id: "slr-method",
    title: "Tahapan Metode SLR",
    tags: ["slr", "metode", "protocol", "prisma", "quality", "synthesis"],
    body: [
      "Tahapan umum SLR: perumusan research question, protokol pencarian, seleksi studi, quality assessment, ekstraksi data, lalu sintesis.",
      "Screening awal biasanya berbasis title dan abstract, dilanjutkan screening full-text.",
      "Pelaporan hasil sering merujuk ke alur PRISMA agar transparan dan dapat direplikasi.",
      "Keputusan include atau exclude harus konsisten terhadap kriteria yang telah ditetapkan sejak awal.",
    ].join(" "),
  },
  {
    id: "paper-knowledge",
    title: "Pengetahuan Dasar Tentang Paper Ilmiah",
    tags: ["paper", "jurnal", "conference", "abstract", "doi", "validitas"],
    body: [
      "Abstract menjelaskan tujuan, metode, dan temuan utama sehingga penting untuk screening awal.",
      "DOI memudahkan identifikasi unik dokumen ilmiah lintas platform.",
      "Sumber publikasi (journal atau conference) dapat membantu menilai konteks dan kredibilitas studi.",
      "Kesesuaian paper dengan pertanyaan riset lebih penting daripada sekadar popularitas venue.",
    ].join(" "),
  },
  {
    id: "database-platform",
    title: "Platform Database Knowledge untuk SLR",
    tags: [
      "database",
      "knowledge",
      "scopus",
      "ieee",
      "acm",
      "springer",
      "pubmed",
      "scienceDirect",
    ],
    body: [
      "Database populer untuk SLR mencakup Scopus, Web of Science, IEEE Xplore, ACM Digital Library, SpringerLink, ScienceDirect, dan PubMed.",
      "Setiap database memiliki cakupan disiplin dan format metadata yang berbeda sehingga strategi query perlu disesuaikan.",
      "Gunakan kombinasi keyword, sinonim, dan operator boolean untuk meningkatkan sensitivitas dan spesifisitas pencarian.",
      "Catat sumber database dan query agar proses SLR transparan.",
    ].join(" "),
  },
  {
    id: "slr-best-practice",
    title: "Best Practice Keputusan Screening",
    tags: ["best-practice", "konsistensi", "justifikasi", "bias", "reviewer"],
    body: [
      "Jika informasi di abstract tidak cukup, keputusan dapat ditandai sementara untuk pemeriksaan full-text.",
      "Hindari keputusan berdasarkan asumsi yang tidak didukung metadata atau isi paper.",
      "Justifikasi sebaiknya menyebutkan kriteria mana yang terpenuhi atau tidak terpenuhi.",
      "Konsistensi antar paper lebih penting dibanding detail stylistic dari penulisan abstract.",
    ].join(" "),
  },
];

type WorkspaceStats = {
  referencesTotal: number;
  analyzedAbstractTotal: number;
  includedAbstractTotal: number;
  excludedAbstractTotal: number;
  inclusionCriteriaTotal: number;
  exclusionCriteriaTotal: number;
  inclusionCriteriaSamples: string[];
  exclusionCriteriaSamples: string[];
  fullTextUploadedTotal: number;
  analyzedFullTextTotal: number;
  includedFullTextTotal: number;
  excludedFullTextTotal: number;
  recentReferences: { title: string; doi: string }[];
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function pickTopKnowledge(query: string, maxItems = 4): RagDocument[] {
  const queryTokens = tokenize(query);

  if (queryTokens.length === 0) {
    return STATIC_RAG_DOCUMENTS.slice(0, maxItems);
  }

  const scored = STATIC_RAG_DOCUMENTS.map((doc) => {
    const titleTokens = tokenize(doc.title);
    const bodyTokens = tokenize(doc.body);
    const tagTokens = doc.tags.flatMap((tag) => tokenize(tag));
    const searchable = new Set([...titleTokens, ...bodyTokens, ...tagTokens]);

    let score = 0;

    for (const token of queryTokens) {
      if (searchable.has(token)) {
        score += 3;
      }

      if (doc.tags.some((tag) => tag.toLowerCase().includes(token))) {
        score += 2;
      }

      if (doc.title.toLowerCase().includes(token)) {
        score += 2;
      }
    }

    if (doc.body.toLowerCase().includes(query.toLowerCase().trim())) {
      score += 4;
    }

    return {
      doc,
      score,
    };
  });

  scored.sort((left, right) => right.score - left.score);

  const top = scored
    .filter((item) => item.score > 0)
    .slice(0, maxItems)
    .map((item) => item.doc);

  if (top.length > 0) {
    return top;
  }

  return STATIC_RAG_DOCUMENTS.slice(0, maxItems);
}

function formatWorkspaceStats(stats: WorkspaceStats): string {
  const referenceLines =
    stats.recentReferences.length === 0
      ? "- Belum ada sample reference."
      : stats.recentReferences
        .map(
          (row, index) =>
            `${index + 1}. ${row.title || "(tanpa judul)"}${
              row.doi ? ` | DOI: ${row.doi}` : ""
            }`,
        )
        .join("\n");

  const inclusionLines =
    stats.inclusionCriteriaSamples.length === 0
      ? "- Belum ada inclusion criteria."
      : stats.inclusionCriteriaSamples.map((name, index) => `${index + 1}. ${name}`).join("\n");

  const exclusionLines =
    stats.exclusionCriteriaSamples.length === 0
      ? "- Belum ada exclusion criteria."
      : stats.exclusionCriteriaSamples.map((name, index) => `${index + 1}. ${name}`).join("\n");

  return [
    "Konteks Workspace Pengguna:",
    `- Total references: ${stats.referencesTotal}`,
    `- Total criteria inclusion: ${stats.inclusionCriteriaTotal}`,
    `- Total criteria exclusion: ${stats.exclusionCriteriaTotal}`,
    `- Total hasil analisa abstract/title: ${stats.analyzedAbstractTotal}`,
    `- Included (abstract/title): ${stats.includedAbstractTotal}`,
    `- Excluded (abstract/title): ${stats.excludedAbstractTotal}`,
    `- Total file full-text terunggah: ${stats.fullTextUploadedTotal}`,
    `- Total hasil analisa full-text: ${stats.analyzedFullTextTotal}`,
    `- Included (full-text): ${stats.includedFullTextTotal}`,
    `- Excluded (full-text): ${stats.excludedFullTextTotal}`,
    "",
    "Sample inclusion criteria:",
    inclusionLines,
    "",
    "Sample exclusion criteria:",
    exclusionLines,
    "",
    "Sample references terbaru:",
    referenceLines,
  ].join("\n");
}

async function getWorkspaceStats(userId: bigint): Promise<WorkspaceStats> {
  const inclusionCriteriaWhere = {
    userId,
    typeCriteria: {
      OR: [
        {
          nama: {
            contains: "inclu",
            mode: "insensitive" as const,
          },
        },
        {
          nama: {
            contains: "iclusion",
            mode: "insensitive" as const,
          },
        },
      ],
    },
  };

  const exclusionCriteriaWhere = {
    userId,
    typeCriteria: {
      nama: {
        contains: "exclu",
        mode: "insensitive" as const,
      },
    },
  };

  const [
    referencesTotal,
    analyzedAbstractTotal,
    includedAbstractTotal,
    excludedAbstractTotal,
    inclusionCriteriaTotal,
    exclusionCriteriaTotal,
    fullTextUploadedTotal,
    analyzedFullTextTotal,
    includedFullTextTotal,
    excludedFullTextTotal,
    inclusionCriteriaRows,
    exclusionCriteriaRows,
    recentReferencesRows,
  ] = await Promise.all([
    prisma.bibReference.count({
      where: {
        userId,
      },
    }),
    prisma.result.count({
      where: {
        references: {
          userId,
        },
      },
    }),
    prisma.result.count({
      where: {
        hasil: "Included",
        references: {
          userId,
        },
      },
    }),
    prisma.result.count({
      where: {
        hasil: "Excluded",
        references: {
          userId,
        },
      },
    }),
    prisma.criteria.count({
      where: inclusionCriteriaWhere,
    }),
    prisma.criteria.count({
      where: exclusionCriteriaWhere,
    }),
    prisma.fullText.count({
      where: {
        result: {
          references: {
            userId,
          },
        },
      },
    }),
    prisma.resultFullText.count({
      where: {
        fullText: {
          result: {
            references: {
              userId,
            },
          },
        },
      },
    }),
    prisma.resultFullText.count({
      where: {
        hasil: "Included",
        fullText: {
          result: {
            references: {
              userId,
            },
          },
        },
      },
    }),
    prisma.resultFullText.count({
      where: {
        hasil: "Excluded",
        fullText: {
          result: {
            references: {
              userId,
            },
          },
        },
      },
    }),
    prisma.criteria.findMany({
      where: inclusionCriteriaWhere,
      orderBy: [{ urutan: "asc" }, { id: "asc" }],
      take: 8,
      select: {
        nama: true,
      },
    }),
    prisma.criteria.findMany({
      where: exclusionCriteriaWhere,
      orderBy: [{ urutan: "asc" }, { id: "asc" }],
      take: 8,
      select: {
        nama: true,
      },
    }),
    prisma.bibReference.findMany({
      where: {
        userId,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 6,
      select: {
        title: true,
        doi: true,
      },
    }),
  ]);

  return {
    referencesTotal,
    analyzedAbstractTotal,
    includedAbstractTotal,
    excludedAbstractTotal,
    inclusionCriteriaTotal,
    exclusionCriteriaTotal,
    inclusionCriteriaSamples: inclusionCriteriaRows
      .map((row) => row.nama.trim())
      .filter((name) => name.length > 0),
    exclusionCriteriaSamples: exclusionCriteriaRows
      .map((row) => row.nama.trim())
      .filter((name) => name.length > 0),
    fullTextUploadedTotal,
    analyzedFullTextTotal,
    includedFullTextTotal,
    excludedFullTextTotal,
    recentReferences: recentReferencesRows.map((row) => ({
      title: row.title?.trim() || "(tanpa judul)",
      doi: row.doi?.trim() || "",
    })),
  };
}

function formatKnowledgeDocs(query: string): string {
  const topDocs = pickTopKnowledge(query, 4);

  return topDocs
    .map((doc, index) => {
      const tagsText = doc.tags.join(", ");
      return `Dokumen ${index + 1}: ${doc.title}\nTags: ${tagsText}\nIsi: ${doc.body}`;
    })
    .join("\n\n");
}

export async function buildChatbotRagContext({
  userId,
  query,
}: {
  userId: bigint;
  query: string;
}): Promise<string> {
  const stats = await getWorkspaceStats(userId);
  const workspaceContext = formatWorkspaceStats(stats);
  const domainKnowledgeContext = formatKnowledgeDocs(query);

  return [
    workspaceContext,
    "",
    "Knowledge Domain (RAG):",
    domainKnowledgeContext,
  ].join("\n");
}
