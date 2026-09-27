export type Column = { name: string; values: number[] };

export type StatResult = {
  method: string;
  why: string;
  assumptions: string[];
  limitations: string[];
  numbers: Record<string, number | string | null>;
  apa: string;
  refused?: string;
};

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: number[], sample = true): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const ss = xs.reduce((a, x) => a + (x - m) ** 2, 0);
  return ss / (xs.length - (sample ? 1 : 0));
}

function sd(xs: number[]): number {
  return Math.sqrt(variance(xs));
}

function logGamma(z: number): number {
  const p = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
  const t = z + p.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(a: number, b: number, x: number): number {
  const MAX = 200;
  const EPS = 3e-12;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const ln = a * Math.log(x) + b * Math.log(1 - x) - logGamma(a) - logGamma(b) + logGamma(a + b);
  const front = Math.exp(ln) / a;
  if (x < (a + 1) / (a + b + 2)) return front * betacf(a, b, x);
  return 1 - (Math.exp(ln) / b) * betacf(b, a, 1 - x);
}

export function studentP(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  const x = df / (df + t * t);
  const beta = regularizedBeta(x, df / 2, 0.5);
  return Math.min(1, Math.max(0, beta));
}

export function fP(f: number, d1: number, d2: number): number {
  if (!Number.isFinite(f) || f < 0 || d1 <= 0 || d2 <= 0) return 1;
  const x = (d1 * f) / (d1 * f + d2);
  return Math.min(1, Math.max(0, 1 - regularizedBeta(x, d1 / 2, d2 / 2)));
}

function round(n: number, d = 3): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function nums(values: unknown[]): number[] {
  return values.map(Number).filter((n) => Number.isFinite(n));
}

export function descriptive(values: number[]): StatResult {
  const xs = values.filter((n) => Number.isFinite(n));
  if (xs.length === 0) return refuse("沒有可用的數值。");
  const m = mean(xs);
  const s = xs.length > 1 ? sd(xs) : 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    method: "描述統計",
    why: "先看分配，再決定推論統計。這不是假設檢定。",
    assumptions: ["數值已正確編碼", "沒有把類別變項當成連續變項"],
    limitations: ["描述統計不能推出母群差異", "極端值會拉動平均數"],
    numbers: { n: xs.length, mean: round(m), sd: round(s), min: sorted[0], max: sorted[sorted.length - 1], median: round(median) },
    apa: `N = ${xs.length}, M = ${round(m, 2)}, SD = ${round(s, 2)}.`,
  };
}

export function pearson(x: number[], y: number[]): StatResult {
  const n = Math.min(x.length, y.length);
  if (n < 3) return refuse("相關至少需要 3 對完整資料。");
  const xs = x.slice(0, n);
  const ys = y.slice(0, n);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return refuse("其中一個變項沒有變異，不能算相關。");
  const r = num / Math.sqrt(dx * dy);
  const df = n - 2;
  const t = r * Math.sqrt(df / Math.max(1e-12, 1 - r * r));
  const p = studentP(t, df);
  return {
    method: "Pearson 積差相關",
    why: "兩個連續變項的線性關聯。沒有被指定因果方向，所以不解釋成影響。",
    assumptions: ["兩個變項大致連續", "關係大致線性", "沒有嚴重極端值"],
    limitations: ["相關不是因果", "樣本小的時候 r 很不穩"],
    numbers: { n, r: round(r), df, t: round(t), p: round(p, 4) },
    apa: `r(${df}) = ${round(r, 2)}, p = ${round(p, 3)}.`,
  };
}

export function welchT(a: number[], b: number[]): StatResult {
  if (a.length < 2 || b.length < 2) return refuse("獨立樣本 t 檢定每組至少 2 筆。");
  const m1 = mean(a);
  const m2 = mean(b);
  const v1 = variance(a);
  const v2 = variance(b);
  const se2 = v1 / a.length + v2 / b.length;
  if (se2 === 0) return refuse("兩組都沒有變異。");
  const t = (m1 - m2) / Math.sqrt(se2);
  const df = se2 ** 2 / ((v1 / a.length) ** 2 / (a.length - 1) + (v2 / b.length) ** 2 / (b.length - 1));
  const p = studentP(t, df);
  const sp = Math.sqrt(((a.length - 1) * v1 + (b.length - 1) * v2) / (a.length + b.length - 2));
  const d = sp === 0 ? 0 : (m1 - m2) / sp;
  return {
    method: "Welch 獨立樣本 t 檢定",
    why: "兩組平均數比較，且不假設變異數相等。",
    assumptions: ["依變項連續", "觀察值獨立", "每組分配沒有極端偏態"],
    limitations: ["不是配對設計時不能用這個", "顯著不代表效果大，要看 Cohen's d"],
    numbers: { n1: a.length, n2: b.length, mean1: round(m1), mean2: round(m2), t: round(t), df: round(df, 2), p: round(p, 4), d: round(d) },
    apa: `t(${round(df, 2)}) = ${round(t, 2)}, p = ${round(p, 3)}, d = ${round(d, 2)}.`,
  };
}

export function pairedT(a: number[], b: number[]): StatResult {
  const n = Math.min(a.length, b.length);
  if (n < 2) return refuse("配對 t 檢定至少 2 對。");
  const diff = a.slice(0, n).map((v, i) => v - b[i]);
  const m = mean(diff);
  const s = sd(diff);
  if (s === 0) return refuse("差值沒有變異。");
  const t = m / (s / Math.sqrt(n));
  const df = n - 1;
  const p = studentP(t, df);
  const d = m / s;
  return {
    method: "配對樣本 t 檢定",
    why: "同一群人前後測，或配對觀察的差值。",
    assumptions: ["差值大致對稱", "配對關係正確", "觀察值獨立於其他配對"],
    limitations: ["前後測沒有控制組時，不能排除成熟或練習效應"],
    numbers: { n, meanDiff: round(m), t: round(t), df, p: round(p, 4), dz: round(d) },
    apa: `t(${df}) = ${round(t, 2)}, p = ${round(p, 3)}, dz = ${round(d, 2)}.`,
  };
}

export function oneWayAnova(groups: number[][]): StatResult {
  const usable = groups.filter((g) => g.length > 0);
  if (usable.length < 2) return refuse("ANOVA 至少兩組。");
  const all = usable.flat();
  const grand = mean(all);
  const k = usable.length;
  const n = all.length;
  const ssb = usable.reduce((sum, g) => sum + g.length * (mean(g) - grand) ** 2, 0);
  const ssw = usable.reduce((sum, g) => sum + g.reduce((s, x) => s + (x - mean(g)) ** 2, 0), 0);
  const dfb = k - 1;
  const dfw = n - k;
  if (dfw <= 0 || ssw === 0) return refuse("組內沒有足夠變異。");
  const msb = ssb / dfb;
  const msw = ssw / dfw;
  const f = msb / msw;
  const p = fP(f, dfb, dfw);
  const eta = ssb / (ssb + ssw);
  return {
    method: "單因子 ANOVA",
    why: "三組以上的平均數一次比較。顯著之後才需要事後比較，這裡不自動做一堆檢定。",
    assumptions: ["依變項連續", "組間獨立", "變異數大致齊一", "每組沒有嚴重偏態"],
    limitations: ["顯著只代表至少有一組不同", "沒有事後比較就不能指出是哪兩組"],
    numbers: { k, n, F: round(f), dfb, dfw, p: round(p, 4), etaSquared: round(eta) },
    apa: `F(${dfb}, ${dfw}) = ${round(f, 2)}, p = ${round(p, 3)}, η² = ${round(eta, 2)}.`,
  };
}

export function cronbach(items: number[][]): StatResult {
  const k = items.length;
  if (k < 2) return refuse("信度至少兩個題目。");
  const n = Math.min(...items.map((col) => col.length));
  if (n < 2) return refuse("每題至少 2 筆。");
  const cols = items.map((col) => col.slice(0, n));
  const itemVars = cols.map((col) => variance(col));
  const totals = Array.from({ length: n }, (_, i) => cols.reduce((s, col) => s + col[i], 0));
  const totalVar = variance(totals);
  if (totalVar === 0) return refuse("總分沒有變異。");
  const alpha = (k / (k - 1)) * (1 - itemVars.reduce((a, b) => a + b, 0) / totalVar);
  return {
    method: "Cronbach's α",
    why: "內部一致性的估計，不是效度。",
    assumptions: ["題目測同一個構念", "題目方向一致，反向題要先計分"],
    limitations: ["α 高不代表單向度", "α 不是重測信度，也不是效標效度"],
    numbers: { k, n, alpha: round(alpha) },
    apa: `Cronbach's α = ${round(alpha, 2)}（${k} items, N = ${n}）.`,
  };
}

export function linearRegression(y: number[], predictors: number[][]): StatResult {
  const n = y.length;
  const k = predictors.length;
  if (n < k + 2) return refuse("迴歸樣本要比預測變項再多至少 2 筆。");
  const x = predictors.map((col) => col.slice(0, n));
  if (x.some((col) => col.length < n)) return refuse("預測變項長度不一致。");
  const cols = [Array(n).fill(1), ...x];
  const p = cols.length;
  const xtx = Array.from({ length: p }, () => Array(p).fill(0));
  const xty = Array(p).fill(0);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let r = 0; r < n; r++) s += cols[i][r] * cols[j][r];
      xtx[i][j] = s;
    }
    let s = 0;
    for (let r = 0; r < n; r++) s += cols[i][r] * y[r];
    xty[i] = s;
  }
  const beta = solve(xtx, xty);
  if (!beta) return refuse("預測變項共線，解不出迴歸係數。");
  const fitted = y.map((_, r) => cols.reduce((s, col, i) => s + col[r] * beta[i], 0));
  const my = mean(y);
  const sst = y.reduce((s, v) => s + (v - my) ** 2, 0);
  const sse = y.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0);
  const r2 = sst === 0 ? 0 : 1 - sse / sst;
  const df = n - p;
  const mse = sse / df;
  return {
    method: "線性迴歸",
    why: "在你指定的預測變項下，估計線性關係。係數不是自動證明的因果。",
    assumptions: ["殘差大致獨立、同變異、沒有嚴重偏離直線", "預測變項沒有嚴重共線"],
    limitations: ["這是樣本內配適", "沒有理論支持時，不要把係數寫成影響"],
    numbers: {
      n,
      r2: round(r2),
      intercept: round(beta[0]),
      coefficients: beta.slice(1).map((b) => round(b)).join(", "),
      mse: round(mse),
      df,
    },
    apa: `R² = ${round(r2, 2)}, N = ${n}. 截距 = ${round(beta[0], 2)}；斜率 = ${beta.slice(1).map((b) => round(b, 2)).join(", ")}.`,
  };
}

function solve(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const a = matrix.map((row, i) => [...row, vector[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const div = a[col][col];
    for (let c = col; c <= n; c++) a[col][c] /= div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = a[r][col];
      for (let c = col; c <= n; c++) a[r][c] -= factor * a[col][c];
    }
  }
  return a.map((row) => row[n]);
}

function refuse(message: string): StatResult {
  return {
    method: "未分析",
    why: message,
    assumptions: [],
    limitations: [],
    numbers: {},
    apa: "",
    refused: message,
  };
}

export function suggestMethod(input: {
  design?: string;
  groups?: number;
  paired?: boolean;
  predictors?: number;
  outcome?: "continuous" | "categorical";
}): string {
  if (input.outcome === "categorical") return "依變項是類別時，不要直接做 t 或 ANOVA。先確認是卡方、邏輯迴歸，還是你其實要的是描述。";
  if ((input.predictors ?? 0) >= 1) return "有明確預測變項時，先寫下假設，再考慮相關或迴歸。不要看到欄位就全部丟進去。";
  if ((input.groups ?? 0) >= 3) return "三組以上優先考慮單因子 ANOVA，而不是重複做很多 t 檢定。";
  if (input.paired) return "同一群人的前後測用配對 t，不要拆成兩個獨立樣本。";
  if ((input.groups ?? 0) === 2) return "兩組獨立比較可用 Welch t。先看每組 n 與分配，再看效果量。";
  return "資料還不足以選推論統計。先做描述統計，並寫清楚研究設計。";
}

export function columnNumbers(rows: Record<string, unknown>[], name: string): number[] {
  return nums(rows.map((row) => row[name]));
}
