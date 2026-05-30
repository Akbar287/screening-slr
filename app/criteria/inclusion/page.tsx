import { CriteriaCrudPage } from "@/app/criteria/criteria-crud-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Inclusion Criteria",
  description: "Kelola inclusion criteria untuk proses seleksi artikel SLR.",
  path: "/criteria/inclusion",
  keywords: ["inclusion criteria", "kriteria inklusi", "slr criteria"],
  noIndex: true,
});

export default function InclusionCriteriaPage() {
  return <CriteriaCrudPage kind="inclusion" />;
}
