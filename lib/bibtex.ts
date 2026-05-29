export type ParsedBibEntry = {
  entryType: string;
  citationKey: string;
  fields: Record<string, string>;
};

export type BibTeXFieldValue = string | number | boolean | Date | null | undefined;

export type BibTeXExportEntry = {
  entryType: string;
  citationKey: string;
  fields: Record<string, BibTeXFieldValue>;
};

type ParsedValuePart = {
  value: string;
  nextIndex: number;
};

function isWhitespace(char: string): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t";
}

function skipWhitespace(text: string, startIndex: number): number {
  let index = startIndex;

  while (index < text.length) {
    if (isWhitespace(text[index])) {
      index += 1;
      continue;
    }

    if (text[index] === "%") {
      while (index < text.length && text[index] !== "\n") {
        index += 1;
      }
      continue;
    }

    break;
  }

  return index;
}

function normalizeValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function readIdentifier(text: string, startIndex: number): { value: string; nextIndex: number } {
  let index = startIndex;

  while (index < text.length) {
    const char = text[index];
    if (!/[A-Za-z0-9_\-]/.test(char)) {
      break;
    }
    index += 1;
  }

  return {
    value: text.slice(startIndex, index).trim(),
    nextIndex: index,
  };
}

function readBalanced(
  text: string,
  startIndex: number,
  opener: string,
  closer: string,
): { value: string; nextIndex: number } | null {
  let index = startIndex;
  let depth = 1;
  let escaped = false;

  while (index < text.length) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      index += 1;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      index += 1;
      continue;
    }

    if (char === opener) {
      depth += 1;
      index += 1;
      continue;
    }

    if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return {
          value: text.slice(startIndex, index),
          nextIndex: index + 1,
        };
      }
      index += 1;
      continue;
    }

    index += 1;
  }

  return null;
}

function findTopLevelComma(text: string): number {
  let index = 0;
  let curlyDepth = 0;
  let parenDepth = 0;
  let inQuotes = false;
  let escaped = false;

  while (index < text.length) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      index += 1;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      index += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      index += 1;
      continue;
    }

    if (!inQuotes) {
      if (char === "{") {
        curlyDepth += 1;
      } else if (char === "}" && curlyDepth > 0) {
        curlyDepth -= 1;
      } else if (char === "(") {
        parenDepth += 1;
      } else if (char === ")" && parenDepth > 0) {
        parenDepth -= 1;
      } else if (char === "," && curlyDepth === 0 && parenDepth === 0) {
        return index;
      }
    }

    index += 1;
  }

  return -1;
}

function readQuotedValue(text: string, startIndex: number): ParsedValuePart {
  let index = startIndex + 1;
  let escaped = false;

  while (index < text.length) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      index += 1;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      index += 1;
      continue;
    }

    if (char === "\"") {
      return {
        value: text.slice(startIndex + 1, index),
        nextIndex: index + 1,
      };
    }

    index += 1;
  }

  return {
    value: text.slice(startIndex + 1),
    nextIndex: text.length,
  };
}

function readBareValue(text: string, startIndex: number): ParsedValuePart {
  let index = startIndex;

  while (index < text.length && text[index] !== "," && text[index] !== "\n") {
    index += 1;
  }

  return {
    value: text.slice(startIndex, index),
    nextIndex: index,
  };
}

function readValuePart(text: string, startIndex: number): ParsedValuePart {
  const index = skipWhitespace(text, startIndex);
  const char = text[index];

  if (char === "{") {
    const balanced = readBalanced(text, index + 1, "{", "}");
    if (!balanced) {
      return { value: text.slice(index + 1), nextIndex: text.length };
    }
    return { value: balanced.value, nextIndex: balanced.nextIndex };
  }

  if (char === "\"") {
    return readQuotedValue(text, index);
  }

  return readBareValue(text, index);
}

function parseFields(fieldsText: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let index = 0;

  while (index < fieldsText.length) {
    index = skipWhitespace(fieldsText, index);

    while (fieldsText[index] === ",") {
      index += 1;
      index = skipWhitespace(fieldsText, index);
    }

    if (index >= fieldsText.length) {
      break;
    }

    const keyStart = index;
    while (index < fieldsText.length && /[A-Za-z0-9_\-]/.test(fieldsText[index])) {
      index += 1;
    }
    const key = fieldsText.slice(keyStart, index).trim().toLowerCase();

    if (!key) {
      break;
    }

    index = skipWhitespace(fieldsText, index);

    if (fieldsText[index] !== "=") {
      while (index < fieldsText.length && fieldsText[index] !== ",") {
        index += 1;
      }
      continue;
    }

    index += 1;
    index = skipWhitespace(fieldsText, index);

    let combinedValue = "";
    while (index < fieldsText.length) {
      const parsedPart = readValuePart(fieldsText, index);
      combinedValue += parsedPart.value;
      index = skipWhitespace(fieldsText, parsedPart.nextIndex);

      if (fieldsText[index] === "#") {
        index += 1;
        index = skipWhitespace(fieldsText, index);
        continue;
      }

      break;
    }

    const normalized = normalizeValue(combinedValue);
    if (normalized.length > 0) {
      fields[key] = normalized;
    }

    index = skipWhitespace(fieldsText, index);
    if (fieldsText[index] === ",") {
      index += 1;
    }
  }

  return fields;
}

function parseEntryBody(entryType: string, body: string): ParsedBibEntry | null {
  const commaIndex = findTopLevelComma(body);
  if (commaIndex === -1) {
    return null;
  }

  const citationKey = body.slice(0, commaIndex).trim();
  if (!citationKey) {
    return null;
  }

  const fieldsText = body.slice(commaIndex + 1);
  const fields = parseFields(fieldsText);

  return {
    entryType: entryType.toLowerCase(),
    citationKey,
    fields,
  };
}

export function parseBibTeX(text: string): ParsedBibEntry[] {
  const entries: ParsedBibEntry[] = [];
  let index = 0;

  while (index < text.length) {
    const atIndex = text.indexOf("@", index);
    if (atIndex === -1) {
      break;
    }

    let cursor = skipWhitespace(text, atIndex + 1);
    const { value: rawType, nextIndex } = readIdentifier(text, cursor);

    if (!rawType) {
      index = atIndex + 1;
      continue;
    }

    const entryType = rawType.toLowerCase();
    cursor = skipWhitespace(text, nextIndex);
    const opener = text[cursor];

    if (entryType === "comment" || entryType === "preamble" || entryType === "string") {
      if (opener === "{" || opener === "(") {
        const closer = opener === "{" ? "}" : ")";
        const skipped = readBalanced(text, cursor + 1, opener, closer);
        index = skipped ? skipped.nextIndex : cursor + 1;
      } else {
        index = cursor + 1;
      }
      continue;
    }

    if (opener !== "{" && opener !== "(") {
      index = cursor + 1;
      continue;
    }

    const closer = opener === "{" ? "}" : ")";
    const balanced = readBalanced(text, cursor + 1, opener, closer);

    if (!balanced) {
      break;
    }

    const parsedEntry = parseEntryBody(entryType, balanced.value);
    if (parsedEntry) {
      entries.push(parsedEntry);
    }

    index = balanced.nextIndex;
  }

  return entries;
}

const BIBTEX_FIELD_ORDER = [
  "author",
  "editor",
  "title",
  "booktitle",
  "journal",
  "year",
  "month",
  "publisher",
  "institution",
  "organization",
  "school",
  "volume",
  "number",
  "series",
  "edition",
  "chapter",
  "pages",
  "address",
  "doi",
  "isbn",
  "issn",
  "url",
  "urldate",
  "keywords",
  "language",
  "type",
  "howpublished",
  "crossref",
  "eprint",
  "archiveprefix",
  "primaryclass",
  "pmid",
  "pmcid",
  "note",
  "abstract",
] as const;

function formatDateToBib(date: Date): string | null {
  const time = date.getTime();
  if (Number.isNaN(time)) {
    return null;
  }

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function normalizeFieldValue(value: BibTeXFieldValue): string | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return formatDateToBib(value);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEntryType(entryType: string): string {
  const normalized = entryType.trim().toLowerCase();
  return normalized.length > 0 ? normalized : "misc";
}

function normalizeCitationKey(citationKey: string, fallbackIndex: number): string {
  const normalized = citationKey.trim();
  return normalized.length > 0 ? normalized : `entry_${fallbackIndex + 1}`;
}

function getFieldOrderIndex(field: string): number {
  const normalized = field.toLowerCase();
  const index = BIBTEX_FIELD_ORDER.findIndex((item) => item === normalized);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sortFields(entries: [string, string][]): [string, string][] {
  return [...entries].sort((a, b) => {
    const orderA = getFieldOrderIndex(a[0]);
    const orderB = getFieldOrderIndex(b[0]);

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return a[0].localeCompare(b[0]);
  });
}

export function serializeBibTeX(entries: BibTeXExportEntry[]): string {
  const blocks = entries.map((entry, entryIndex) => {
    const type = normalizeEntryType(entry.entryType);
    const key = normalizeCitationKey(entry.citationKey, entryIndex);
    const normalizedFields = Object.entries(entry.fields)
      .map(([field, rawValue]) => {
        const normalizedValue = normalizeFieldValue(rawValue);
        return [field.trim().toLowerCase(), normalizedValue] as const;
      })
      .filter(([field, value]) => field.length > 0 && value !== null) as [string, string][];

    const sortedFields = sortFields(normalizedFields);

    const lines = [`@${type}{${key},`];

    sortedFields.forEach(([field, value], index) => {
      const suffix = index === sortedFields.length - 1 ? "" : ",";
      lines.push(`  ${field} = {${value}}${suffix}`);
    });

    lines.push("}");
    return lines.join("\n");
  });

  return blocks.join("\n\n");
}
