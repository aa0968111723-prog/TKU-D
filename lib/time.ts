const TAIPEI = "Asia/Taipei";

export function nowIso(date = new Date()): string {
  return date.toISOString();
}

export function taipeiParts(date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  dateKey: string;
} {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  return {
    year,
    month,
    day,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday] ?? 1,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export function greeting(date = new Date()): string {
  const hour = taipeiParts(date).hour;
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早安";
  if (hour < 14) return "午安";
  if (hour < 18) return "下午好";
  if (hour < 23) return "晚安";
  return "夜深了";
}

export function formatTaipei(iso: string | null | undefined, withTime = false): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: TAIPEI,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
  }).format(date);
}

/** Midnight Taipei as UTC ISO, offset by whole days. */
export function taipeiStartIso(date = new Date(), dayOffset = 0): string {
  const p = taipeiParts(date);
  const utc = Date.UTC(p.year, p.month - 1, p.day + dayOffset, -8, 0, 0);
  return new Date(utc).toISOString();
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86400000);
}

const WEEKDAY: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 7,
  天: 7,
};

export function parseLooseDate(text: string, now = new Date()): string | null {
  const p = taipeiParts(now);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day, -8, 0, 0));

  const iso = text.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), -8, 18, 0)).toISOString();
  }
  const md = text.match(/(?:^|[^\d])(\d{1,2})\/(\d{1,2})(?:[^\d]|$)/);
  if (md) {
    let year = p.year;
    const month = Number(md[1]);
    const day = Number(md[2]);
    if (month < p.month || (month === p.month && day < p.day)) year += 1;
    return new Date(Date.UTC(year, month - 1, day, -8, 18, 0)).toISOString();
  }
  if (/今天/.test(text)) return new Date(base.getTime() + 18 * 3600000).toISOString();
  if (/明天/.test(text)) return new Date(base.getTime() + 86400000 + 18 * 3600000).toISOString();
  if (/後天/.test(text)) return new Date(base.getTime() + 2 * 86400000 + 18 * 3600000).toISOString();
  const inDays = text.match(/(\d+)\s*天後/);
  if (inDays) return new Date(base.getTime() + Number(inDays[1]) * 86400000 + 18 * 3600000).toISOString();
  if (/下週之前|下週前|下周之前|下周前|這週末|本週末/.test(text)) {
    const delta = (7 - p.weekday + 7) % 7 || 7;
    return new Date(base.getTime() + delta * 86400000 + 18 * 3600000).toISOString();
  }
  if (/下週|下周/.test(text) && !/週[一二三四五六日天]/.test(text)) {
    const delta = ((8 - p.weekday) % 7) + 7;
    return new Date(base.getTime() + delta * 86400000 + 9 * 3600000).toISOString();
  }
  const week = text.match(/下{0,1}週([一二三四五六日天])/);
  if (week) {
    const target = WEEKDAY[week[1]];
    let delta = (target - p.weekday + 7) % 7;
    if (text.includes("下週") || delta === 0) delta += 7;
    if (!text.includes("下週") && delta === 0) delta = 7;
    return new Date(base.getTime() + delta * 86400000 + 18 * 3600000).toISOString();
  }
  const fri = text.match(/星期([一二三四五六日天])/);
  if (fri) {
    const target = WEEKDAY[fri[1]];
    let delta = (target - p.weekday + 7) % 7;
    if (delta === 0) delta = 7;
    return new Date(base.getTime() + delta * 86400000 + 18 * 3600000).toISOString();
  }
  return null;
}
