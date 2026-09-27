import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { overlapTerms, cosine, ngramVector, chunkText } from "../domain/text";
import { dataDir, type Sql } from "../db";
import { doiIn } from "../domain/apa";
import { classifyCapture } from "../domain/capture";
import { lookupDoi, searchWorks } from "../integrations/scholarly";
import { parseDocument } from "../parsers/documents";
import * as repo from "../repo";
import { complete, parseJsonBlock } from "../ai/provider";
import { buildBriefing } from "../domain/briefing";
import { id } from "../ids";

const SYSTEM = `你是淡江大學教育心理與諮商研究所研究生的研究夥伴，名字叫研究貓。
你安靜、溫暖、具體，不責備，不製造焦慮，不幼稚化。
你不替使用者寫完作業或論文。你提問、拆解、比較、指出矛盾、找證據。
教育與諮商內容不能當成臨床診斷。禁止替真實個案做疾病診斷。
禁止捏造文獻。找不到來源就寫「未找到可靠來源」。
回答必須盡量使用使用者自己的資料，並用 JSON 回傳：
{"speech":"給人看的短回覆","sections":{"source":"原始資料","organized":"AI整理","inference":"AI推論","unverified":"待確認"},"citations":[{"label":"","entityType":"","entityId":"","page":null}],"followups":[]}
source 只寫資料裡真的有的內容。inference 必須標成推論。不確定就放 unverified，不要裝成事實。`;

export async function runCapture(db: Sql, userId: string, text: string, now = new Date()) {
  const plan = classifyCapture(text, now);
  const note = repo.createNote(db, userId, {
    title: plan.title,
    body: text,
    kind: plan.noteKind,
    sensitivity: plan.sensitivity,
    source: "user",
  });
  let task = null;
  let meeting = null;
  let idea = null;
  if (plan.task) task = repo.createTask(db, userId, { title: plan.task.title, dueAt: plan.task.dueAt, sourceNoteId: note.id, projectId: null });
  if (plan.meeting) meeting = repo.createMeeting(db, userId, { title: "老師／討論紀錄", body: text, happenedAt: now.toISOString(), teacherFeedback: text });
  if (plan.idea) idea = repo.createIdea(db, userId, text);
  const projects = repo.listProjects(db, userId);
  if (plan.research && projects[0] && plan.task) {
    repo.updateTask(db, userId, String(task && "id" in (task as object) ? (task as { id: string }).id : ""), { projectId: projects[0].id });
  }
  return { plan, note, task, meeting, idea, speech: plan.privacyWarning ?? "記好了。原始文字留著，我也幫你放到該去的地方。" };
}

export async function ingestFile(db: Sql, userId: string, file: { filename: string; mime: string; bytes: Uint8Array }, extra: { projectId?: string; courseId?: string } = {}) {
  const parsed = await parseDocument(file.filename, file.mime, file.bytes);
  const stored = path.join(dataDir(), "files", userId);
  mkdirSync(stored, { recursive: true });
  const storedName = `${id()}-${file.filename.replace(/[^\w.\-\u3400-\u9fff]+/g, "_")}`;
  writeFileSync(path.join(stored, storedName), file.bytes);
  let text = parsed.pages.map((page) => page.text).join("\n\n");
  if (parsed.needsVision && file.mime.startsWith("image/")) {
    const vision = await complete({
      reasoning: false,
      messages: [
        { role: "system", content: "你在協助整理掃描文件。只轉錄看得到的文字。看不清就標待確認。不要補不存在的內容。" },
        { role: "user", content: [{ type: "text", text: "請轉錄這張圖裡看得到的文字。" }, { type: "image_url", image_url: { url: `data:${file.mime};base64,${Buffer.from(file.bytes).toString("base64")}` } }] },
      ],
    }).catch(() => "");
    if (vision) {
      text = vision;
      parsed.pages = [{ page: 1, text: vision }];
    }
  }
  const doi = doiIn(text) || doiIn(file.filename);
  const scholarly = doi ? await lookupDoi(doi) : null;
  const localTitle = parsed.title;
  const scholarlyTitle = scholarly?.title;
  const titleConflict = Boolean(scholarlyTitle && localTitle && localTitle.length > 8 && !localTitle.includes(scholarlyTitle.slice(0, 12)) && !scholarlyTitle.includes(localTitle.slice(0, 12)));
  const docId = repo.insertDocument(db, userId, {
    title: titleConflict ? localTitle : scholarlyTitle || localTitle,
    filename: file.filename,
    mime: file.mime,
    path: path.join("files", userId, storedName),
    source: "upload",
    bytes: file.bytes.byteLength,
    textStatus: text ? "ready" : "empty",
    courseId: extra.courseId,
    projectId: extra.projectId,
    sensitivity: /個案|逐字稿|訪談/.test(text) ? "sensitive" : "normal",
  });
  const paper = repo.createPaper(db, userId, {
    documentId: docId,
    title: titleConflict ? localTitle : scholarlyTitle || localTitle,
    year: scholarly?.year,
    journal: scholarly?.journal,
    doi: scholarly?.doi || doi,
    url: scholarly?.url,
    abstract: scholarly?.abstract,
    authors: scholarly?.authors.map((author) => [author.family, author.given].filter(Boolean).join(" ")) ?? [],
    projectId: extra.projectId,
    status: "inbox",
  });
  if (scholarly?.apa7) {
    repo.saveCitation(db, userId, String(paper.id), { doi: scholarly.doi, apa7: scholarly.apa7, source: scholarly.source, sourceUrl: scholarly.url, verified: true, raw: scholarly });
  } else {
    repo.saveCitation(db, userId, String(paper.id), { doi, apa7: null, source: "none", verified: false, raw: { note: "未找到可靠來源" } });
  }
  const chunks = chunkText(parsed.pages.length ? parsed.pages : [{ page: null, text }]);
  const chunkIds = repo.replaceChunks(db, userId, docId, String(paper.id), chunks);
  chunkIds.forEach((chunkId, index) => repo.saveEmbedding(db, userId, chunkId, ngramVector(chunks[index]?.content ?? "")));
  const project = extra.projectId ? repo.getProject(db, userId, extra.projectId) : repo.listProjects(db, userId)[0];
  const relation = explainRelation(String(paper.title), String(paper.abstract ?? text.slice(0, 800)), project ? `${project.title}\n${project.topic ?? ""}` : "");
  if (relation.relevance) {
    if (titleConflict && scholarlyTitle) {
      relation.relevanceReason = `DOI 對到的公開題名是「${scholarlyTitle}」，和文件開頭不一致。引用仍用查到的來源，文件題名先留著，請確認是不是貼錯 DOI。${relation.relevanceReason}`;
    }
    repo.updatePaper(db, userId, String(paper.id), relation);
  }
  return { paperId: paper.id, documentId: docId, scholarly: Boolean(scholarly), relation, text };
}

export async function enrichPaper(db: Sql, userId: string, paperId: string) {
  const paper = repo.getPaper(db, userId, paperId);
  if (!paper) throw new Error("找不到文獻");
  const chunks = repo.listChunksForRetrieval(db, userId, true).filter((chunk) => chunk.paper_id === paperId).slice(0, 8);
  const evidence = chunks.map((chunk) => `[p.${chunk.page ?? "?"}] ${chunk.content}`).join("\n\n").slice(0, 12000);
  const project = paper.project_id ? repo.getProject(db, userId, String(paper.project_id)) : repo.listProjects(db, userId)[0];
  const raw = await complete({
    reasoning: true,
    json: true,
    messages: [
      { role: "system", content: `${SYSTEM}\n只根據下面的文獻文字抽取欄位。文字沒有的欄位填「待確認」，不要補。` },
      { role: "user", content: `文獻：${paper.title}\n研究主題：${project?.topic ?? project?.title ?? "尚未設定"}\n\n文字：\n${evidence || paper.abstract || "沒有抽出文字"}\n\n回傳 JSON，鍵包含 purpose, questions, theory, method, participants, sampleSize, instruments, statistics, findings, limitations, futureWork, oneLiner, summary300, fullSummary, methodSummary, valueNote, relevance, relevanceReason。relevance 只能是 high, partial, background, method, theory, contrary, skip 之一。` },
    ],
  });
  const fields = parseJsonBlock(raw) ?? { unverified: raw, oneLiner: "AI 沒有給出可解析的結構，原始回覆已保留。" };
  repo.saveExtraction(db, userId, paperId, fields, "model");
  if (fields.relevance) {
    repo.updatePaper(db, userId, paperId, { relevance: fields.relevance, relevanceReason: fields.relevanceReason, status: "reading" });
  }
  const note = repo.createNote(db, userId, {
    title: `文獻筆記：${paper.title}`,
    body: `【AI 整理，不是原文】\n${fields.oneLiner ?? ""}\n\n${fields.summary300 ?? ""}\n\n跟研究的關係：${fields.relevanceReason ?? "待確認"}`,
    kind: "literature",
    paperId,
    projectId: paper.project_id,
    source: "ai",
  });
  return { paper: repo.getPaper(db, userId, paperId), note };
}

function explainRelation(title: string, abstract: string, topic: string) {
  const terms = overlapTerms(`${title}\n${abstract}`, topic);
  if (!topic.trim()) return { relevance: "background", relevanceReason: "還沒有研究主題，所以先當成背景文獻。這不是相關分數。" };
  if (terms.length >= 2) return { relevance: "partial", relevanceReason: `跟目前主題共用這些詞：${terms.join("、")}。還不能說高度相關，因為還沒對過研究問題與方法。` };
  if (terms.length === 1) return { relevance: "background", relevanceReason: `只看到「${terms[0]}」重疊。可能是背景，不一定要整篇讀。` };
  return { relevance: "skip", relevanceReason: "目前文字裡沒有跟研究主題重疊的關鍵詞。先標成可能不用讀，若你知道它重要，再手動改。" };
}

export function retrieve(db: Sql, userId: string, query: string, includeSensitive: boolean) {
  const lexical = repo.search(db, userId, query, includeSensitive);
  const chunks = repo.listChunksForRetrieval(db, userId, includeSensitive);
  const qv = ngramVector(query);
  const ranked = chunks
    .map((chunk) => {
      const vector = chunk.vector_json ? (JSON.parse(String(chunk.vector_json)) as number[]) : ngramVector(String(chunk.content));
      const lexicalHit = String(chunk.content).includes(query) ? 0.35 : 0;
      return { chunk, score: cosine(qv, vector) + lexicalHit };
    })
    .filter((item) => item.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => item.chunk);
  return { lexical: lexical.slice(0, 8), chunks: ranked };
}

export async function chat(db: Sql, userId: string, input: { message: string; conversationId?: string; mode?: string; paperId?: string; projectId?: string; courseId?: string }) {
  const settings = repo.getSettings(db, userId);
  const mode = input.mode || String(settings.mode || "research");
  const includeSensitive = Boolean(settings.ai_include_sensitive) || mode === "meeting";
  const conversationId = input.conversationId || repo.createConversation(db, userId, { mode, paperId: input.paperId, projectId: input.projectId, courseId: input.courseId, title: input.message.slice(0, 24) });
  repo.addMessage(db, userId, conversationId, "user", input.message);
  const found = retrieve(db, userId, input.message, includeSensitive);
  const memories = repo.listMemories(db, userId).slice(0, 8);
  const profile = repo.getProfile(db, userId);
  const history = repo.listMessages(db, userId, conversationId).slice(-8);
  const context = [
    `模式：${mode}。蘇格拉底模式：${settings.socratic ? "開" : "關"}。`,
    profile ? `研究生：${profile.year_level ?? ""} ${profile.research_interest ?? ""} ${profile.thesis_direction ?? ""}` : "",
    memories.length ? `長期記憶：\n${memories.map((m) => `- ${m.key}: ${m.content}`).join("\n")}` : "",
    found.lexical.length ? `搜尋命中：\n${found.lexical.map((item) => `- [${item.entity_type}:${item.entity_id}] ${item.title} ${item.snippet ?? ""}`).join("\n")}` : "搜尋沒有命中自己的資料。",
    found.chunks.length ? `文獻片段：\n${found.chunks.map((chunk) => `- [${chunk.title} p.${chunk.page ?? "?"} id:${chunk.paper_id ?? chunk.document_id}] ${String(chunk.content).slice(0, 500)}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  const agent = routeAgent(mode, input.message);
  const answer = await complete({
    reasoning: agent === "literature" || agent === "writing" || agent === "method",
    json: true,
    messages: [
      { role: "system", content: `${SYSTEM}\n內部任務：${agent}。不要在回覆裡提 agent 名稱。${settings.socratic ? "不要直接給唯一答案。先給兩到三種可能，指出證據與缺口，再問一個問題。" : "可以更直接，但仍要區分整理與推論。"}` },
      ...history.slice(0, -1).map((message) => ({ role: message.role as "user" | "assistant", content: String(message.content) })),
      { role: "user", content: `${context}\n\n問題：${input.message}` },
    ],
  });
  const parsed = parseJsonBlock(answer);
  const speech = String(parsed?.speech || answer);
  repo.addMessage(db, userId, conversationId, "assistant", speech, { sections: parsed?.sections, sources: parsed?.citations, agent });
  const memorable = parsed?.sections && typeof parsed.sections === "object" ? (parsed.sections as { inference?: string }).inference : "";
  if (memorable && input.projectId) repo.upsertMemory(db, userId, "project", input.message.slice(0, 24), String(memorable).slice(0, 280), "project", input.projectId);
  return { conversationId, speech, sections: parsed?.sections ?? null, citations: parsed?.citations ?? [], followups: parsed?.followups ?? [], agent };
}

function routeAgent(mode: string, message: string): string {
  if (mode === "writing" || /論文|章節|討論/.test(message)) return "writing";
  if (mode === "study" || /這堂課|考試|複習/.test(message)) return "course";
  if (/統計|t-test|ANOVA|迴歸|信度/.test(message)) return "statistics";
  if (/編碼|主題|逐字稿/.test(message)) return "qualitative";
  if (/文獻|paper|比較/.test(message)) return "literature";
  if (/研究問題|假設|方法/.test(message)) return "method";
  if (mode === "capture") return "planning";
  return "research";
}

export function briefingFor(db: Sql, userId: string, name: string, now = new Date()) {
  const bundle = repo.todayBundle(db, userId, now);
  const project = bundle.project as { id?: string; title?: string; next_step?: string; progress?: number } | null;
  const feedback = bundle.feedback as { teacher_feedback?: string } | null;
  return buildBriefing({
    now,
    name,
    coursesToday: (bundle.courses as Array<{ id: string; name: string; start_time: string | null }>) ?? [],
    openTasks: (bundle.tasks as Array<{ id: string; title: string; due_at: string | null; priority: number }>) ?? [],
    unreadPapers: ((bundle.papers as unknown[]) ?? []).length,
    project: project?.id ? { id: String(project.id), title: String(project.title), next_step: project.next_step ? String(project.next_step) : null, progress: Number(project.progress ?? 0) } : null,
    lastFeedback: feedback?.teacher_feedback ? String(feedback.teacher_feedback) : null,
  });
}

export async function matrix(db: Sql, userId: string, paperIds: string[]) {
  const papers = paperIds.map((paperId) => repo.getPaper(db, userId, paperId)).filter(Boolean);
  const rows = papers.map((paper) => {
    const extraction = (paper?.extraction ?? {}) as Record<string, unknown>;
    return {
      id: paper?.id,
      authors: paper?.authors,
      year: paper?.year,
      title: paper?.title,
      questions: extraction.questions ?? "待確認",
      theory: extraction.theory ?? "待確認",
      method: extraction.method ?? "待確認",
      sample: extraction.participants ?? extraction.sample_size ?? "待確認",
      instruments: extraction.instruments ?? "待確認",
      analysis: extraction.statistics ?? "待確認",
      findings: extraction.findings ?? "待確認",
      limitations: extraction.limitations ?? "待確認",
      gap: extraction.future_work ?? "待確認",
      relation: paper?.relevance_reason ?? "待確認",
    };
  });
  let synthesis: Record<string, unknown> | null = null;
  if (rows.length >= 2) {
    const raw = await complete({
      reasoning: true,
      json: true,
      messages: [
        { role: "system", content: "比較文獻時，只能根據給定欄位。空的或待確認不能補成事實。回傳 JSON：commonFindings, contradictions, theoryDifferences, methodDifferences, openQuestions, gapMap。每一點都要註明是 AI 推論。" },
        { role: "user", content: JSON.stringify(rows) },
      ],
    }).catch(() => "");
    synthesis = raw ? parseJsonBlock(raw) : null;
  }
  return { rows, synthesis, label: "AI 推論。欄位裡的待確認沒有被拿來假裝成結果。" };
}

export async function methodLab(idea: string, topic?: string) {
  const raw = await complete({
    reasoning: true,
    json: true,
    messages: [
      { role: "system", content: "你在協助拆研究想法，不是核定研究設計。每個欄位都要有 suggestion, reason, risk, alternative。禁止說設計一定正確。回傳 JSON。" },
      { role: "user", content: `想法：${idea}\n既有主題：${topic ?? "無"}\n欄位：background, motivation, questions, purpose, hypotheses, independentVariable, dependentVariable, controls, operationalDefinition, theory, design, sample, instruments, ethics, analysis。` },
    ],
  });
  return parseJsonBlock(raw) ?? { unverified: raw };
}

export async function suggestCodes(db: Sql, userId: string, qualId: string, transcriptId: string) {
  const transcript = repo.getTranscriptBody(db, userId, transcriptId);
  if (!transcript || transcript.qual_project_id !== qualId) throw new Error("找不到逐字稿");
  const raw = await complete({
    reasoning: true,
    json: true,
    messages: [
      { role: "system", content: "你只能建議編碼，不能改寫逐字稿，也不能取代研究者。每筆包含 excerpt（必須是原文片段）、label、memo。回傳 {\"codes\":[]}。這是敏感研究資料，不要診斷。" },
      { role: "user", content: String(transcript.body).slice(0, 8000) },
    ],
  });
  const parsed = parseJsonBlock(raw);
  const codes = Array.isArray(parsed?.codes) ? parsed.codes : [];
  return codes.slice(0, 12).map((code) => repo.addCode(db, userId, qualId, { ...(code as Record<string, unknown>), transcriptId, origin: "ai_suggestion" }));
}

export async function recommendForIdea(db: Sql, userId: string, ideaId: string) {
  const idea = repo.listIdeas(db, userId).find((item) => item.id === ideaId);
  if (!idea) throw new Error("找不到靈感");
  const works = await searchWorks(String(idea.raw_text), 5);
  repo.updateIdea(db, userId, ideaId, works.map((work) => ({ ...work, note: work.doi ? "OpenAlex 公開紀錄" : "未找到 DOI，不能當成正式引用" })));
  return works;
}

export { searchWorks };
