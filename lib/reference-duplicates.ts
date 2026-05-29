export type DuplicateDetectionInput = {
  id: bigint;
  citationKey: string;
  entryType: string;
  title: string | null;
  doi: string | null;
  year: number | null;
  journal: string | null;
  publisher: string | null;
  updatedAt: Date;
};

export type DuplicateReason = "doi" | "nama" | "doi_dan_nama";

export type DuplicatePair = {
  left: DuplicateDetectionInput;
  right: DuplicateDetectionInput;
  doiSimilarity: number;
  namaSimilarity: number;
  maxSimilarity: number;
  reason: DuplicateReason;
};

type PreparedRecord = {
  record: DuplicateDetectionInput;
  idString: string;
  doiNormalized: string;
  namaNormalized: string;
};

type PairAccumulator = {
  left: DuplicateDetectionInput;
  right: DuplicateDetectionInput;
  doiSimilarity: number;
  namaSimilarity: number;
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDoi(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "")
    .replace(/\s+/g, "")
    .trim();
}

function bigramMap(text: string): Map<string, number> {
  const map = new Map<string, number>();

  if (text.length < 2) {
    map.set(text, 1);
    return map;
  }

  for (let index = 0; index < text.length - 1; index += 1) {
    const gram = text.slice(index, index + 2);
    map.set(gram, (map.get(gram) ?? 0) + 1);
  }

  return map;
}

function diceSimilarityPercentage(a: string, b: string): number {
  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 100;
  }

  const aMap = bigramMap(a);
  const bMap = bigramMap(b);

  let intersection = 0;
  for (const [gram, countA] of aMap.entries()) {
    const countB = bMap.get(gram) ?? 0;
    intersection += Math.min(countA, countB);
  }

  const total = [...aMap.values()].reduce((sum, value) => sum + value, 0)
    + [...bMap.values()].reduce((sum, value) => sum + value, 0);

  if (total === 0) {
    return 0;
  }

  const score = (2 * intersection) / total;
  return Number((score * 100).toFixed(2));
}

function buildPairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}::${idB}` : `${idB}::${idA}`;
}

function resolveReason(doiSimilarity: number, namaSimilarity: number, threshold: number): DuplicateReason {
  const doiMatch = doiSimilarity >= threshold;
  const namaMatch = namaSimilarity >= threshold;

  if (doiMatch && namaMatch) {
    return "doi_dan_nama";
  }

  if (doiMatch) {
    return "doi";
  }

  return "nama";
}

function comparePreparedRecordPair(
  first: PreparedRecord,
  second: PreparedRecord,
  threshold: number,
): {
  isDuplicate: boolean;
  doiSimilarity: number;
  namaSimilarity: number;
} {
  const doiSimilarity = diceSimilarityPercentage(first.doiNormalized, second.doiNormalized);
  const namaSimilarity = diceSimilarityPercentage(first.namaNormalized, second.namaNormalized);

  return {
    isDuplicate: doiSimilarity >= threshold || namaSimilarity >= threshold,
    doiSimilarity,
    namaSimilarity,
  };
}

function sortedNeighborhoodPairs(
  records: PreparedRecord[],
  selector: (record: PreparedRecord) => string,
  windowSize: number,
  threshold: number,
  accumulator: Map<string, PairAccumulator>,
) {
  const sorted = [...records]
    .filter((record) => selector(record).length > 0)
    .sort((a, b) => selector(a).localeCompare(selector(b)));

  for (let index = 0; index < sorted.length; index += 1) {
    const left = sorted[index];
    const limit = Math.min(sorted.length - 1, index + windowSize);

    for (let next = index + 1; next <= limit; next += 1) {
      const right = sorted[next];
      const comparison = comparePreparedRecordPair(left, right, threshold);

      if (!comparison.isDuplicate) {
        continue;
      }

      const key = buildPairKey(left.idString, right.idString);
      const existing = accumulator.get(key);

      if (!existing) {
        accumulator.set(key, {
          left: left.record,
          right: right.record,
          doiSimilarity: comparison.doiSimilarity,
          namaSimilarity: comparison.namaSimilarity,
        });
        continue;
      }

      existing.doiSimilarity = Math.max(existing.doiSimilarity, comparison.doiSimilarity);
      existing.namaSimilarity = Math.max(existing.namaSimilarity, comparison.namaSimilarity);
    }
  }
}

export function detectReferenceDuplicatePairs(
  records: DuplicateDetectionInput[],
  {
    threshold = 80,
    windowSize = 12,
    maxPairs = 200,
  }: {
    threshold?: number;
    windowSize?: number;
    maxPairs?: number;
  } = {},
): DuplicatePair[] {
  const preparedRecords: PreparedRecord[] = records.map((record) => ({
    record,
    idString: record.id.toString(),
    doiNormalized: normalizeDoi(record.doi),
    namaNormalized: normalizeText(record.title),
  }));

  const pairMap = new Map<string, PairAccumulator>();

  sortedNeighborhoodPairs(
    preparedRecords,
    (record) => record.doiNormalized,
    windowSize,
    threshold,
    pairMap,
  );

  sortedNeighborhoodPairs(
    preparedRecords,
    (record) => record.namaNormalized,
    windowSize,
    threshold,
    pairMap,
  );

  return [...pairMap.values()]
    .map((pair) => {
      const maxSimilarity = Math.max(pair.doiSimilarity, pair.namaSimilarity);

      return {
        left: pair.left,
        right: pair.right,
        doiSimilarity: pair.doiSimilarity,
        namaSimilarity: pair.namaSimilarity,
        maxSimilarity,
        reason: resolveReason(pair.doiSimilarity, pair.namaSimilarity, threshold),
      } satisfies DuplicatePair;
    })
    .sort((a, b) => b.maxSimilarity - a.maxSimilarity)
    .slice(0, Math.max(0, maxPairs));
}

export function detectReferenceExactDuplicatePairs(
  records: DuplicateDetectionInput[],
  {
    maxPairs = 200,
  }: {
    maxPairs?: number;
  } = {},
): DuplicatePair[] {
  const preparedRecords: PreparedRecord[] = records.map((record) => ({
    record,
    idString: record.id.toString(),
    doiNormalized: normalizeDoi(record.doi),
    namaNormalized: normalizeText(record.title),
  }));

  const grouped = new Map<string, PreparedRecord[]>();

  for (const preparedRecord of preparedRecords) {
    if (!preparedRecord.doiNormalized || !preparedRecord.namaNormalized) {
      continue;
    }

    const key = `${preparedRecord.doiNormalized}::${preparedRecord.namaNormalized}`;
    const list = grouped.get(key) ?? [];
    list.push(preparedRecord);
    grouped.set(key, list);
  }

  const pairs: DuplicatePair[] = [];
  const safeMaxPairs = Math.max(0, maxPairs);

  for (const group of grouped.values()) {
    if (group.length < 2) {
      continue;
    }

    const sortedGroup = [...group].sort((a, b) => a.idString.localeCompare(b.idString));
    const anchor = sortedGroup[0];

    for (let index = 1; index < sortedGroup.length; index += 1) {
      const candidate = sortedGroup[index];

      pairs.push({
        left: anchor.record,
        right: candidate.record,
        doiSimilarity: 100,
        namaSimilarity: 100,
        maxSimilarity: 100,
        reason: "doi_dan_nama",
      });

      if (pairs.length >= safeMaxPairs) {
        return pairs;
      }
    }
  }

  return pairs;
}
