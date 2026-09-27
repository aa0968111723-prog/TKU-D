import { parseLooseDate } from "../time";

export type CaptureKind = "note" | "task" | "event" | "idea" | "meeting" | "mixed";

export type CapturePlan = {
  kind: CaptureKind;
  title: string;
  noteKind: "course" | "research" | "literature" | "idea" | "life" | "meeting" | "capture";
  sensitivity: "normal" | "sensitive";
  privacyWarning: string | null;
  keywords: string[];
  task: { title: string; dueAt: string | null } | null;
  event: { title: string; startsAt: string } | null;
  meeting: boolean;
  idea: boolean;
  research: boolean;
};

const SENSITIVE = /個案|來談者|當事人|訪談逐字|逐字稿|診斷|自殺|自傷|病歷|研究參與者/;
const MEETING = /老師說|老師建議|老師叫|指導教授|督導說|meeting|開會/;
const IDEA = /突然想到|靈感|也許可以|能不能做|研究想法|×/;
const TASK = /記得|要交|截止|deadline|之前|作業|寄信|買|申請|完成/;
const RESEARCH = /研究問題|論文|文獻|研究缺口|理論|假設/;
const LITERATURE = /這篇|paper|論文說|作者/;

const DOMAIN_TERMS = [
  "正念", "情緒調節", "自我效能", "同理心", "敘事", "藝術治療", "生涯", "團體諮商",
  "心理衡鑑", "研究倫理", "質性研究", "量化", "焦慮", "壓力", "大學生", "依附",
  "學習策略", "正向心理", "多元文化", "靈性", "教育科技",
];

export function extractKeywords(text: string): string[] {
  const found = DOMAIN_TERMS.filter((term) => text.includes(term));
  const extra = text.match(/[A-Za-z][A-Za-z-]{3,}/g) ?? [];
  return [...new Set([...found, ...extra.slice(0, 4)])].slice(0, 8);
}

export function classifyCapture(text: string, now = new Date()): CapturePlan {
  const raw = text.trim();
  const title = raw.replace(/\s+/g, " ").slice(0, 42) || "未命名";
  const sensitive = SENSITIVE.test(raw);
  const meeting = MEETING.test(raw);
  const idea = IDEA.test(raw);
  const taskish = TASK.test(raw) || /明天|下週|星期|今天要/.test(raw);
  const research = RESEARCH.test(raw);
  const literature = LITERATURE.test(raw);
  const dueAt = parseLooseDate(raw, now);
  const eventish = /上課|meeting|開會|找同學|實習/.test(raw) && dueAt !== null && !/截止|交作業/.test(raw);

  let noteKind: CapturePlan["noteKind"] = "capture";
  if (meeting) noteKind = "meeting";
  else if (idea) noteKind = "idea";
  else if (literature) noteKind = "literature";
  else if (research) noteKind = "research";
  else if (/課|老師|作業|報告/.test(raw)) noteKind = "course";
  else if (!research && !taskish) noteKind = "life";

  const flags = [meeting, idea, taskish, eventish].filter(Boolean).length;
  let kind: CaptureKind = "note";
  if (flags > 1) kind = "mixed";
  else if (meeting) kind = "meeting";
  else if (idea) kind = "idea";
  else if (eventish) kind = "event";
  else if (taskish) kind = "task";

  const taskTitle = meeting
    ? raw.replace(/^.*?(老師說|老師建議|老師叫|督導說)/, "").replace(/^[：:，,\s]+/, "").slice(0, 48) || title
    : title;

  return {
    kind,
    title,
    noteKind,
    sensitivity: sensitive ? "sensitive" : "normal",
    privacyWarning: sensitive
      ? "這段看起來像個案或研究參與者資料。已標成敏感，預設不會送進一般 AI 上下文。請先去識別化。"
      : null,
    keywords: extractKeywords(raw),
    task: taskish || meeting ? { title: taskTitle || title, dueAt } : null,
    event: eventish && dueAt ? { title, startsAt: dueAt } : null,
    meeting,
    idea,
    research,
  };
}
