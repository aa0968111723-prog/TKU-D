export const THESIS_STAGES = [
  ["0", "研究方向"],
  ["1", "題目探索"],
  ["2", "研究問題"],
  ["3", "文獻搜尋"],
  ["4", "文獻回顧"],
  ["5", "理論架構"],
  ["6", "研究方法"],
  ["7", "IRB／倫理"],
  ["8", "資料收集"],
  ["9", "資料分析"],
  ["10", "結果"],
  ["11", "討論"],
  ["12", "結論"],
  ["13", "格式"],
  ["14", "口試"],
] as const;

export const RELEVANCE = [
  ["high", "高度相關"],
  ["partial", "部分相關"],
  ["background", "背景文獻"],
  ["method", "方法學參考"],
  ["theory", "理論參考"],
  ["contrary", "反方研究"],
  ["skip", "可能不用讀"],
] as const;

export const MODES = ["study", "research", "writing", "focus", "meeting", "capture"] as const;
export type ResearchMode = (typeof MODES)[number];

export const STARTER_NAV = ["today", "ai", "courses", "research", "notes"] as const;
export const ADVANCED_NAV = [
  "papers",
  "matrix",
  "thesis",
  "graph",
  "meetings",
  "calendar",
  "ideas",
  "stats",
  "qualitative",
  "weekly",
  "sources",
  "focus",
] as const;
