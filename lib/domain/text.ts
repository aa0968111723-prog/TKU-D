export type Chunk = { content: string; page: number | null; index: number };

export function chunkText(pages: Array<{ page: number | null; text: string }>, size = 900): Chunk[] {
  const chunks: Chunk[] = [];
  let index = 0;
  for (const page of pages) {
    const text = page.text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").trim();
    if (!text) continue;
    const parts = text.split(/\n{2,}/);
    let buffer = "";
    const flush = () => {
      const content = buffer.trim();
      if (content.length < 20) return;
      chunks.push({ content, page: page.page, index: index++ });
      buffer = "";
    };
    for (const part of parts) {
      if ((buffer + "\n\n" + part).length > size && buffer) flush();
      buffer = buffer ? `${buffer}\n\n${part}` : part;
      if (buffer.length >= size) flush();
    }
    if (buffer.trim()) {
      const content = buffer.trim();
      if (content.length >= 20) chunks.push({ content, page: page.page, index: index++ });
    }
  }
  return chunks;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function ngramVector(text: string, dim = 128): number[] {
  const vec = Array(dim).fill(0);
  const clean = text.replace(/\s+/g, "");
  if (clean.length < 2) return vec;
  for (let i = 0; i < clean.length - 1; i++) {
    const gram = clean.slice(i, i + 2);
    let hash = 0;
    for (let c = 0; c < gram.length; c++) hash = (hash * 33 + gram.charCodeAt(c)) >>> 0;
    vec[hash % dim] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

export function overlapTerms(a: string, b: string): string[] {
  const terms = new Set<string>();
  const source = `${a}\n${b}`;
  for (const token of source.match(/[\u3400-\u9fff]{2,8}|[A-Za-z][A-Za-z-]{3,}/g) ?? []) {
    if (a.includes(token) && b.includes(token) && token.length >= 2) terms.add(token);
  }
  return [...terms].slice(0, 12);
}
