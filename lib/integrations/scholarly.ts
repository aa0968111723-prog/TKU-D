import { apa7, type ApaAuthor } from "../domain/apa";

export type ScholarlyRecord = {
  title: string;
  year: number | null;
  journal: string | null;
  doi: string;
  authors: ApaAuthor[];
  abstract: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  url: string;
  source: "crossref" | "openalex";
  apa7: string | null;
};

function yearOf(value: unknown): number | null {
  if (typeof value === "number") return value;
  const match = String(value ?? "").match(/20\d{2}|19\d{2}/);
  return match ? Number(match[0]) : null;
}

export async function lookupDoi(doi: string): Promise<ScholarlyRecord | null> {
  const clean = doi.replace(/^https?:\/\/doi.org\//i, "").trim();
  const mailto = process.env.CROSSREF_MAILTO || "edupsy@localhost";
  const crossref = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`, {
    headers: { "User-Agent": `TKU-EduPsy/1.0 (mailto:${mailto})` },
  }).then(async (res) => (res.ok ? res.json() : null)).catch(() => null);
  const work = crossref?.message;
  if (work?.title?.[0]) {
    const authors: ApaAuthor[] = (work.author ?? []).map((author: { family?: string; given?: string; name?: string }) => ({
      family: author.family || author.name || "",
      given: author.given,
    })).filter((author: ApaAuthor) => author.family);
    const record: ScholarlyRecord = {
      title: work.title[0],
      year: yearOf(work.issued?.["date-parts"]?.[0]?.[0]),
      journal: work["container-title"]?.[0] ?? null,
      doi: clean,
      authors,
      abstract: work.abstract ? String(work.abstract).replace(/<[^>]+>/g, "") : null,
      volume: work.volume ?? null,
      issue: work.issue ?? null,
      pages: work.page ?? null,
      url: `https://doi.org/${clean}`,
      source: "crossref",
      apa7: null,
    };
    record.apa7 = apa7(record);
    return record;
  }
  const openalex = await fetch(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(clean)}`).then(async (res) => (res.ok ? res.json() : null)).catch(() => null);
  if (!openalex?.title) return null;
  const authors: ApaAuthor[] = (openalex.authorships ?? []).map((item: { author?: { display_name?: string } }) => {
    const name = item.author?.display_name ?? "";
    const bits = name.split(" ");
    return { family: bits.at(-1) ?? name, given: bits.slice(0, -1).join(" ") };
  });
  const record: ScholarlyRecord = {
    title: openalex.title,
    year: openalex.publication_year ?? null,
    journal: openalex.primary_location?.source?.display_name ?? null,
    doi: clean,
    authors,
    abstract: null,
    volume: null,
    issue: null,
    pages: null,
    url: openalex.id ?? `https://doi.org/${clean}`,
    source: "openalex",
    apa7: null,
  };
  record.apa7 = apa7(record);
  return record;
}

export async function searchWorks(query: string, limit = 5): Promise<Array<{ title: string; year: number | null; doi: string | null; authors: string }>> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}`;
  const data = await fetch(url).then(async (res) => (res.ok ? res.json() : null)).catch(() => null);
  return (data?.results ?? []).map((work: { title?: string; publication_year?: number; doi?: string; authorships?: Array<{ author?: { display_name?: string } }> }) => ({
    title: work.title ?? "未命名",
    year: work.publication_year ?? null,
    doi: work.doi?.replace("https://doi.org/", "") ?? null,
    authors: (work.authorships ?? []).slice(0, 3).map((item) => item.author?.display_name).filter(Boolean).join(", "),
  }));
}
