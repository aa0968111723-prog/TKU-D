import { unzipSync, strFromU8 } from "fflate";
import mammoth from "mammoth";
import { extractText } from "unpdf";
import { stripHtml } from "../domain/text";

export type ParsedDocument = {
  title: string;
  pages: Array<{ page: number | null; text: string }>;
  needsVision: boolean;
};

function titleFrom(text: string, filename: string): string {
  const line = text.split(/\n/).map((item) => item.trim()).find((item) => item.length > 6 && item.length < 180);
  return line || filename.replace(/\.[^.]+$/, "");
}

function xmlText(xml: string): string {
  return xml
    .replace(/<a:t[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ")
    .trim();
}

export async function parseDocument(filename: string, mime: string, bytes: Uint8Array): Promise<ParsedDocument> {
  const lower = filename.toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/.test(lower)) {
    return { title: filename, pages: [], needsVision: true };
  }
  if (lower.endsWith(".pdf") || mime === "application/pdf") {
    const extracted = await extractText(bytes, { mergePages: false });
    const texts = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
    const pages = texts.map((text, index) => ({ page: index + 1, text: String(text ?? "") }));
    const joined = pages.map((page) => page.text).join("\n");
    return { title: titleFrom(joined, filename), pages, needsVision: joined.trim().length < 40 };
  }
  if (lower.endsWith(".docx")) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { title: titleFrom(result.value, filename), pages: [{ page: null, text: result.value }], needsVision: false };
  }
  if (lower.endsWith(".pptx")) {
    const zip = unzipSync(bytes);
    const slides = Object.keys(zip)
      .filter((name) => /ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const pages = slides.map((name, index) => ({ page: index + 1, text: xmlText(strFromU8(zip[name])) }));
    return { title: titleFrom(pages.map((p) => p.text).join("\n"), filename), pages, needsVision: false };
  }
  if (lower.endsWith(".xlsx")) {
    const text = xlsxText(bytes);
    return { title: titleFrom(text, filename), pages: [{ page: null, text }], needsVision: false };
  }
  if (lower.endsWith(".csv") || mime === "text/csv") {
    const text = new TextDecoder().decode(bytes);
    return { title: filename.replace(/\.csv$/i, ""), pages: [{ page: null, text }], needsVision: false };
  }
  const text = new TextDecoder().decode(bytes);
  const cleaned = lower.endsWith(".html") || mime.includes("html") ? stripHtml(text) : text;
  return { title: titleFrom(cleaned, filename), pages: [{ page: null, text: cleaned }], needsVision: false };
}

function xlsxText(bytes: Uint8Array): string {
  const zip = unzipSync(bytes);
  const shared = zip["xl/sharedStrings.xml"] ? strFromU8(zip["xl/sharedStrings.xml"]).match(/<t[^>]*>([^<]*)<\/t>/g)?.map((item) => item.replace(/<[^>]+>/g, "")) ?? [] : [];
  const sheetName = Object.keys(zip).find((name) => /xl\/worksheets\/sheet1\.xml$/.test(name));
  if (!sheetName) return "";
  const xml = strFromU8(zip[sheetName]);
  const rows = [...xml.matchAll(/<row[\s\S]*?<\/row>/g)];
  return rows
    .map((row) => {
      const cells = [...row[0].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)];
      return cells
        .map((cell) => {
          const type = /t="([^"]+)"/.exec(cell[1])?.[1];
          const value = /<v>([^<]*)<\/v>/.exec(cell[2])?.[1] ?? "";
          if (type === "s") return shared[Number(value)] ?? "";
          const inline = /<t[^>]*>([^<]*)<\/t>/.exec(cell[2])?.[1];
          return inline ?? value;
        })
        .join("\t");
    })
    .join("\n");
}

export function parseCsv(text: string): { columns: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { columns: [], rows: [] };
  const split = (line: string) => {
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i++;
        } else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        cells.push(current.trim());
        current = "";
      } else current += ch;
    }
    cells.push(current.trim());
    return cells;
  };
  const columns = split(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? ""]));
  });
  return { columns, rows };
}
