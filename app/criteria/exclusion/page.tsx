import { CriteriaCrudPage } from "@/app/criteria/criteria-crud-page";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Exclusion Criteria",
  description: "Kelola exclusion criteria untuk proses seleksi artikel SLR.",
  path: "/criteria/exclusion",
  keywords: ["exclusion criteria", "kriteria eksklusi", "slr criteria"],
  noIndex: true,
});

export default function ExclusionCriteriaPage() {
  return <CriteriaCrudPage kind="exclusion" />;
}
