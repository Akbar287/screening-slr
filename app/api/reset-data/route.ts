import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { resetAllJobs as resetBibtexAnalysisJobs } from "@/lib/ai-analysis-jobs";
import { authOptions } from "@/lib/auth-options";
import { resetAllJobs as resetFullTextAnalysisJobs } from "@/lib/full-text-analysis-jobs";
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

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = parseUserId(session?.user?.id);

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  const [
    resultFullTextCriteriaDeleted,
    resultFullTextDeleted,
    fullTextDeleted,
    resultCriteriaDeleted,
    resultDeleted,
    criteriaDeleted,
    referencesDeleted,
    typeCriteriaDeleted,
  ] = await prisma.$transaction([
    prisma.resultFullTextCriteria.deleteMany({}),
    prisma.resultFullText.deleteMany({}),
    prisma.fullText.deleteMany({}),
    prisma.resultCriteria.deleteMany({}),
    prisma.result.deleteMany({}),
    prisma.criteria.deleteMany({}),
    prisma.bibReference.deleteMany({}),
    prisma.typeCriteria.deleteMany({}),
  ]);

  resetBibtexAnalysisJobs();
  resetFullTextAnalysisJobs();

  return NextResponse.json({
    message: "Semua data selain user berhasil direset.",
    summary: {
      resultFullTextCriteriaDeleted: resultFullTextCriteriaDeleted.count,
      resultFullTextDeleted: resultFullTextDeleted.count,
      fullTextDeleted: fullTextDeleted.count,
      resultCriteriaDeleted: resultCriteriaDeleted.count,
      resultDeleted: resultDeleted.count,
      criteriaDeleted: criteriaDeleted.count,
      referencesDeleted: referencesDeleted.count,
      typeCriteriaDeleted: typeCriteriaDeleted.count,
    },
  });
}
