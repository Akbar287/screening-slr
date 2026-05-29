export type AnalyzedReferenceTableRow = {
  id: string;
  referenceId: string;
  citationKey: string;
  entryType: string;
  title: string | null;
  doi: string | null;
  year: number | null;
  journal: string | null;
  publisher: string | null;
  hasil: "Included" | "Excluded";
  justifikasi: string;
  ai: string;
  updatedAt: string;
};
