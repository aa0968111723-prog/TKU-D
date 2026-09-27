import assert from "node:assert/strict";
import test from "node:test";
import { apa7, doiIn, parseBibtex, parseRis } from "../lib/domain/apa";
import { classifyCapture } from "../lib/domain/capture";
import { buildBriefing } from "../lib/domain/briefing";
import { cronbach, descriptive, oneWayAnova, pearson, studentP, welchT } from "../lib/domain/stats";
import { parseLooseDate } from "../lib/time";

test("student t two-tailed p for a known value", () => {
  const p = studentP(1.96, 1000);
  assert.ok(p > 0.04 && p < 0.06, String(p));
});

test("descriptive stats", () => {
  const result = descriptive([1, 2, 3, 4, 5]);
  assert.equal(result.numbers.mean, 3);
  assert.equal(result.numbers.n, 5);
});

test("pearson of a variable with itself is 1", () => {
  const result = pearson([1, 2, 3, 4], [1, 2, 3, 4]);
  assert.equal(result.numbers.r, 1);
});

test("welch t separates two distant groups", () => {
  const result = welchT([1, 2, 3, 2], [8, 9, 10, 9]);
  assert.equal(result.refused, undefined);
  assert.ok(Number(result.numbers.p) < 0.05);
});

test("anova and cronbach", () => {
  const anova = oneWayAnova([[1, 2, 1], [2, 3, 2], [8, 9, 8]]);
  assert.ok(Number(anova.numbers.p) < 0.05);
  const alpha = cronbach([[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 5]]);
  assert.ok(Number(alpha.numbers.alpha) > 0.8);
});

test("apa 7 does not invent a citation without authors and year", () => {
  assert.equal(apa7({ authors: [], year: 2024, title: "Untitled" }), null);
  const citation = apa7({
    authors: [{ family: "Wang", given: "Li" }, { family: "Chen", given: "Mei" }],
    year: 2025,
    title: "Mindfulness and academic stress",
    journal: "Journal of Educational Psychology",
    doi: "10.1037/edu0000001",
  });
  assert.match(citation ?? "", /Wang, L\., & Chen, M\. \(2025\)/);
  assert.match(citation ?? "", /https:\/\/doi.org\/10.1037\/edu0000001/);
});

test("doi, ris, and bibtex parsers", () => {
  assert.equal(doiIn("see https://doi.org/10.3389/fpsyg.2019.02709."), "10.3389/fpsyg.2019.02709");
  const ris = parseRis("TY  - JOUR\nAU  - Wang Li\nTI  - A study\nPY  - 2024\nDO  - 10.1000/test\nER  - \n");
  assert.equal(ris[0].TI, "A study");
  const bib = parseBibtex("@article{w2024,\n title = {A study},\n doi = {10.1000/test}\n}");
  assert.equal(bib[0].title, "A study");
});

test("capture keeps the original idea and extracts a task from teacher talk", () => {
  const now = new Date("2026-09-28T02:00:00.000Z");
  const plan = classifyCapture("老師說下週之前把研究問題收斂。", now);
  assert.equal(plan.meeting, true);
  assert.ok(plan.task);
  assert.ok(plan.task?.dueAt);
  const idea = classifyCapture("突然想到：正念 × 自我效能 × 大學生？", now);
  assert.equal(idea.idea, true);
  assert.equal(idea.noteKind, "idea");
  const sensitive = classifyCapture("個案小明說他這週很焦慮", now);
  assert.equal(sensitive.sensitivity, "sensitive");
  assert.ok(sensitive.privacyWarning);
});

test("loose dates land on a Friday deadline", () => {
  const due = parseLooseDate("星期五交研究方法作業", new Date("2026-09-28T02:00:00.000Z"));
  assert.ok(due);
  assert.match(due ?? "", /^2026-10-02/);
});

test("briefing never invents urgency and caps important items at 3", () => {
  const briefing = buildBriefing({
    now: new Date("2026-09-28T02:00:00.000Z"),
    name: "研究生",
    coursesToday: [{ id: "c1", name: "研究方法", start_time: "14:00" }],
    openTasks: [
      { id: "t1", title: "交作業", due_at: "2026-09-30T10:00:00.000Z", priority: 1 },
      { id: "t2", title: "買教材", due_at: "2026-12-01T10:00:00.000Z", priority: 3 },
    ],
    unreadPapers: 3,
    project: { id: "p1", title: "正念研究", next_step: "縮小研究問題", progress: 38 },
    lastFeedback: "把研究問題再縮小",
  });
  assert.equal(briefing.important.length <= 3, true);
  assert.match(briefing.speech, /真正要看的只有/);
  assert.equal(briefing.pose, "reminder");
  assert.doesNotMatch(briefing.speech, /沒完成|責備|傷心/);
});
