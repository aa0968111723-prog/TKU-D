export type ApaAuthor = { family: string; given?: string };

const CJK = /[\u3400-\u9fff]/;

export function formatAuthors(authors: ApaAuthor[]): string {
  if (authors.length === 0) return "";
  const rendered = authors.map((author) => {
    const family = author.family.trim();
    const given = (author.given ?? "").trim();
    if (!family) return given;
    if (CJK.test(family) || CJK.test(given)) return `${family}${given}`.replace(/\s+/g, "");
    const initials = given
      .split(/\s+|-/ )
      .filter(Boolean)
      .map((part) => `${part[0].toUpperCase()}.`)
      .join(" ");
    return initials ? `${family}, ${initials}` : family;
  });
  if (rendered.length === 1) return rendered[0];
  if (rendered.length === 2) return `${rendered[0]}, & ${rendered[1]}`;
  return `${rendered.slice(0, -1).join(", ")}, & ${rendered[rendered.length - 1]}`;
}

export function apa7(input: {
  authors: ApaAuthor[];
  year?: number | null;
  title: string;
  journal?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  doi?: string | null;
}): string | null {
  if (!input.title.trim()) return null;
  if (input.authors.length === 0 || !input.year) return null;
  const who = formatAuthors(input.authors);
  let citation = `${who} (${input.year}). ${input.title.replace(/\.*$/, "")}.`;
  if (input.journal) {
    citation += ` ${input.journal}`;
    if (input.volume) citation += `, ${input.volume}`;
    if (input.issue) citation += `(${input.issue})`;
    if (input.pages) citation += `, ${input.pages}`;
    citation += ".";
  }
  if (input.doi) citation += ` https://doi.org/${input.doi.replace(/^https?:\/\/doi.org\//i, "")}`;
  return citation;
}

export function doiIn(text: string): string | null {
  const match = text.match(/\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i);
  if (!match) return null;
  return match[1].replace(/[.)\],;]+$/, "");
}

export function parseRis(raw: string): Array<Record<string, string | string[]>> {
  const records: Array<Record<string, string | string[]>> = [];
  let current: Record<string, string | string[]> | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9]{2})\s+-\s(.*)$/);
    if (!match) continue;
    const tag = match[1];
    const value = match[2].trim();
    if (tag === "TY") current = {};
    if (!current) continue;
    if (tag === "ER") {
      records.push(current);
      current = null;
      continue;
    }
    const prev = current[tag];
    if (tag === "AU" || tag === "A1") {
      current[tag] = [...(Array.isArray(prev) ? prev : prev ? [String(prev)] : []), value];
    } else if (!prev) current[tag] = value;
  }
  return records;
}

export function parseBibtex(raw: string): Array<Record<string, string>> {
  const records: Array<Record<string, string>> = [];
  const blocks = raw.split(/@\w+\s*\{/).slice(1);
  for (const block of blocks) {
    const body = block.split(/\n\s*\}/)[0] ?? block;
    const fields: Record<string, string> = {};
    const key = body.split(",")[0]?.trim();
    if (key) fields._key = key;
    const re = /(\w+)\s*=\s*(?:\{([\s\S]*?)\}|"([^"]*)")/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(body))) {
      fields[match[1].toLowerCase()] = (match[2] ?? match[3] ?? "").replace(/\s+/g, " ").trim();
    }
    if (fields.title || fields.doi) records.push(fields);
  }
  return records;
}

export function bibtexAuthors(field: string | undefined): ApaAuthor[] {
  if (!field) return [];
  return field.split(/\s+and\s+/i).map((part) => {
    const [family, given] = part.split(",").map((s) => s.trim());
    if (given) return { family, given };
    const bits = part.trim().split(/\s+/);
    return { family: bits[bits.length - 1] ?? part, given: bits.slice(0, -1).join(" ") };
  });
}
