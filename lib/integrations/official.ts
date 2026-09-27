import { createHash } from "node:crypto";
import { stripHtml } from "../domain/text";

const SOURCES = [
  { title: "教育心理與諮商研究所首頁", url: "https://www.edpsy.tku.edu.tw/" },
  { title: "淡江大學首頁", url: "https://www.tku.edu.tw/" },
];

export async function fetchOfficial(): Promise<Array<{ title: string; url: string; excerpt: string; hash: string }>> {
  const items = [];
  for (const source of SOURCES) {
    const res = await fetch(source.url, { signal: AbortSignal.timeout(12000), headers: { "User-Agent": "TKU-EduPsy/1.0" } });
    const html = await res.text();
    const excerpt = stripHtml(html).slice(0, 1200);
    const hash = createHash("sha256").update(html).digest("hex");
    items.push({ title: source.title, url: source.url, excerpt, hash });
    const rows = [...html.matchAll(/(\d{4}-\d{2}-\d{2})[\s\S]{0,80}?>([^<]{4,80})</g)].slice(0, 12);
    for (const row of rows) {
      const title = `${row[1]} ${row[2].replace(/\s+/g, " ").trim()}`;
      const piece = `${source.url}#${title}`;
      items.push({
        title,
        url: source.url,
        excerpt: `來自 ${source.title}。這是頁面上的公告標題，不是修業規則。`,
        hash: createHash("sha256").update(piece).digest("hex"),
      });
    }
  }
  return items;
}
