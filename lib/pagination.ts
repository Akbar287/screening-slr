export type PaginationItem = number | "ellipsis";

export function buildPaginationItems({
  currentPage,
  totalPages,
  siblingCount = 1,
}: {
  currentPage: number;
  totalPages: number;
  siblingCount?: number;
}): PaginationItem[] {
  const safeTotal = Math.max(1, totalPages);
  const safeCurrent = Math.min(Math.max(1, currentPage), safeTotal);

  if (safeTotal <= 1) {
    return [1];
  }

  const pageSet = new Set<number>([1, safeTotal]);
  const start = Math.max(1, safeCurrent - siblingCount);
  const end = Math.min(safeTotal, safeCurrent + siblingCount);

  for (let page = start; page <= end; page += 1) {
    pageSet.add(page);
  }

  const sortedPages = [...pageSet].sort((a, b) => a - b);
  const items: PaginationItem[] = [];
  let previousPage: number | null = null;

  for (const page of sortedPages) {
    if (previousPage !== null) {
      const gap = page - previousPage;

      if (gap === 2) {
        items.push(previousPage + 1);
      } else if (gap > 2) {
        items.push("ellipsis");
      }
    }

    items.push(page);
    previousPage = page;
  }

  return items;
}
