export type ReferenceTableRow = {
  id: string;
  citationKey: string;
  entryType: string;
  title: string | null;
  year: number | null;
  journal: string | null;
  publisher: string | null;
  doi: string | null;
  url: string | null;
  updatedAt: string;
};
