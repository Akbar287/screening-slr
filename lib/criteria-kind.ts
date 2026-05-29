export type CriteriaKind = "inclusion" | "exclusion";

type CriteriaKindConfig = {
  displayName: string;
  route: string;
  aliases: string[];
};

export const CRITERIA_KIND_ORDER: CriteriaKind[] = ["inclusion", "exclusion"];

export const CRITERIA_KIND_CONFIG: Record<CriteriaKind, CriteriaKindConfig> = {
  inclusion: {
    displayName: "Inclusion Criteria",
    route: "/criteria/inclusion",
    aliases: ["Inclusion Criteria", "Inclusion", "Iclusion Criteria", "Iclusion"],
  },
  exclusion: {
    displayName: "Exclusion Criteria",
    route: "/criteria/exclusion",
    aliases: ["Exclusion Criteria", "Exclusion"],
  },
};

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function matchesCriteriaAlias(value: string, aliases: string[]): boolean {
  const normalizedValue = normalizeText(value);

  return aliases.some((alias) => normalizeText(alias) === normalizedValue);
}
