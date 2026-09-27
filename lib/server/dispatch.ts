import { readFileSync } from "node:fs";
import path from "node:path";
import { aiHealth } from "../ai/provider";
import { openSeal, seal } from "../crypto";
import { apa7, bibtexAuthors, parseBibtex, parseRis } from "../domain/apa";
import { columnNumbers, cronbach, descriptive, linearRegression, oneWayAnova, pairedT, pearson, suggestMethod, welchT } from "../domain/stats";
import { db } from "../db";
import { fail, json, originOf, readSid, sealSession, sessionCookie } from "../http";
import { calendarList, classifyMail, driveDownload, driveList, gmailDraft, gmailList, googleAuthUrl, googleConfigured, googleExchange, googleRefresh } from "../integrations/google";
import { fetchOfficial } from "../integrations/official";
import { lookupDoi } from "../integrations/scholarly";
import { pkceVerifier, probeTku, tkuAuthorizeUrl, tkuExchange, tkuStatus } from "../integrations/tku";
import { parseCsv } from "../parsers/documents";
import * as repo from "../repo";
import { briefingFor, chat, enrichPaper, ingestFile, matrix, methodLab, recommendForIdea, runCapture, suggestCodes } from "../services/engine";
import { addDays } from "../time";

const database = () => db();

async function userFrom(req: Request): Promise<(repo.Row & { sid: string }) | null> {
  const sid = await readSid(req.headers.get("cookie"));
  if (!sid) return null;
  const user = repo.userFromSession(database(), sid);
  return user ? { ...user, sid } : null;
}

async function withSession(userId: string, extra?: HeadersInit) {
  const token = await sealSession(repo.createSession(database(), userId));
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(token), ...(extra as object) });
}

function devLoginAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_DEV_LOGIN === "true";
}

async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  if (req.headers.get("content-type")?.includes("application/json")) return req.json();
  return {};
}

async function googleAccess(userId: string): Promise<string> {
  const account = repo.getIntegration(database(), userId, "google");
  if (!account?.access_token) throw new Error("還沒連接 Google");
  const token = openSeal(String(account.access_token));
  const refresh = openSeal(String(account.refresh_token || ""));
  if (!token) throw new Error("Google 憑證無法解密");
  if (account.expires_at && String(account.expires_at) < new Date().toISOString() && refresh) {
    const next = await googleRefresh(refresh);
    repo.saveIntegration(database(), userId, "google", { accessToken: seal(next.accessToken), refreshToken: account.refresh_token, expiresAt: next.expiresAt, email: account.external_email, scopes: account.scopes });
    return next.accessToken;
  }
  return token;
}

export async function dispatch(req: Request, method: string, parts: string[]): Promise<Response> {
  const [root, a, b, c] = parts;
  const url = new URL(req.url);
  try {
    if (root === "health") {
      const ai = await aiHealth();
      const sso = tkuStatus();
      return json({ ok: true, ai, sso, google: googleConfigured() });
    }
    if (root === "auth") return auth(req, method, parts.slice(1));

    const user = await userFrom(req);
    if (!user) return fail(401, "請先登入", "unauthorized");
    const userId = String(user.id);
    const databaseNow = database();

    if (root === "today" && method === "GET") {
      const bundle = repo.todayBundle(databaseNow, userId);
      const briefing = briefingFor(databaseNow, userId, String(user.name));
      return json({ user, profile: repo.getProfile(databaseNow, userId), settings: repo.getSettings(databaseNow, userId), briefing, ...bundle });
    }
    if (root === "onboarding" && method === "POST") {
      return json(repo.saveOnboarding(databaseNow, userId, await bodyOf(req)));
    }
    if (root === "settings" && method === "GET") return json(repo.getSettings(databaseNow, userId));
    if (root === "settings" && method === "PATCH") return json(repo.updateSettings(databaseNow, userId, await bodyOf(req)));
    if (root === "capture" && method === "POST") {
      const body = await bodyOf(req);
      return json(await runCapture(databaseNow, userId, String(body.text ?? "")));
    }
    if (root === "search" && method === "GET") {
      const settings = repo.getSettings(databaseNow, userId);
      return json(repo.search(databaseNow, userId, url.searchParams.get("q") ?? "", Boolean(settings.ai_include_sensitive)));
    }
    if (root === "courses" && !a && method === "GET") return json(repo.listCourses(databaseNow, userId));
    if (root === "courses" && !a && method === "POST") return json(repo.createCourse(databaseNow, userId, await bodyOf(req)));
    if (root === "courses" && a && !b && method === "GET") {
      const course = repo.getCourse(databaseNow, userId, a);
      return course ? json(course) : fail(404, "找不到課程");
    }
    if (root === "courses" && b === "materials" && method === "POST") return json(repo.addMaterial(databaseNow, userId, a, await bodyOf(req)));
    if (root === "courses" && b === "review" && method === "POST") return reviewCourse(userId, a);
    if (root === "notes" && !a && method === "GET") return json(repo.listNotes(databaseNow, userId, url.searchParams.get("kind") ?? undefined));
    if (root === "notes" && !a && method === "POST") return json(repo.createNote(databaseNow, userId, await bodyOf(req)));
    if (root === "notes" && a && method === "GET") {
      const note = repo.getNote(databaseNow, userId, a);
      return note ? json(note) : fail(404, "找不到筆記");
    }
    if (root === "notes" && a && method === "PATCH") return json(repo.updateNote(databaseNow, userId, a, await bodyOf(req)));
    if (root === "tasks" && !a && method === "GET") return json(repo.listTasks(databaseNow, userId, url.searchParams.get("status") ?? "open"));
    if (root === "tasks" && !a && method === "POST") return json(repo.createTask(databaseNow, userId, await bodyOf(req)));
    if (root === "tasks" && a && method === "PATCH") return json(repo.updateTask(databaseNow, userId, a, await bodyOf(req)));
    if (root === "events" && method === "GET") return json(repo.listEvents(databaseNow, userId, url.searchParams.get("from") ?? undefined, url.searchParams.get("to") ?? undefined));
    if (root === "events" && method === "POST") return json(repo.createEvent(databaseNow, userId, await bodyOf(req)));
    if (root === "meetings" && method === "GET") return json(repo.listMeetings(databaseNow, userId));
    if (root === "meetings" && method === "POST") return json(repo.createMeeting(databaseNow, userId, await bodyOf(req)));
    if (root === "ideas" && !a && method === "GET") return json(repo.listIdeas(databaseNow, userId));
    if (root === "ideas" && !a && method === "POST") return json(repo.createIdea(databaseNow, userId, String((await bodyOf(req)).text ?? "")));
    if (root === "ideas" && b === "recommend") return json(await recommendForIdea(databaseNow, userId, a));
    if (root === "projects" && !a && method === "GET") return json(repo.listProjects(databaseNow, userId));
    if (root === "projects" && !a && method === "POST") return json(repo.createProject(databaseNow, userId, await bodyOf(req)));
    if (root === "projects" && a && !b && method === "GET") {
      const project = repo.getProject(databaseNow, userId, a);
      return project ? json(project) : fail(404, "找不到研究");
    }
    if (root === "projects" && a && !b && method === "PATCH") return json(repo.updateProject(databaseNow, userId, a, await bodyOf(req)));
    if (root === "projects" && b === "questions" && method === "POST") {
      const body = await bodyOf(req);
      return json(repo.addQuestion(databaseNow, userId, a, String(body.body ?? ""), body.note ? String(body.note) : undefined));
    }
    if (root === "projects" && b === "thesis" && c && method === "PATCH") return json(repo.updateThesis(databaseNow, userId, a, c, await bodyOf(req)));
    if (root === "revisions" && method === "GET") return json(repo.listRevisions(databaseNow, userId, url.searchParams.get("type") ?? "", url.searchParams.get("id") ?? ""));
    if (root === "papers" && a === "upload" && method === "POST") return uploadPaper(req, userId);
    if (root === "papers" && a === "matrix" && method === "POST") {
      const body = await bodyOf(req);
      return json(await matrix(databaseNow, userId, Array.isArray(body.ids) ? body.ids.map(String) : []));
    }
    if (root === "papers" && a === "import" && method === "POST") return importCitations(userId, await bodyOf(req));
    if (root === "papers" && !a && method === "GET") return json(repo.listPapers(databaseNow, userId));
    if (root === "papers" && a && b === "read" && method === "POST") return json(await enrichPaper(databaseNow, userId, a));
    if (root === "papers" && a && !b && method === "GET") {
      const paper = repo.getPaper(databaseNow, userId, a);
      return paper ? json(paper) : fail(404, "找不到文獻");
    }
    if (root === "papers" && a && !b && method === "PATCH") return json(repo.updatePaper(databaseNow, userId, a, await bodyOf(req)));
    if (root === "citations" && method === "GET") {
      const doi = url.searchParams.get("doi");
      if (!doi) return fail(400, "需要 DOI");
      const found = await lookupDoi(doi);
      return json(found ?? { apa7: null, message: "未找到可靠來源" });
    }
    if (root === "chat" && method === "POST") return json(await chat(databaseNow, userId, await bodyOf(req) as { message: string; conversationId?: string; mode?: string }));
    if (root === "conversations" && !a) return json(repo.listConversations(databaseNow, userId));
    if (root === "conversations" && a) return json(repo.listMessages(databaseNow, userId, a));
    if (root === "graph") return json(repo.listGraph(databaseNow, userId));
    if (root === "weekly") return weekly(userId);
    if (root === "method-lab" && method === "POST") {
      const body = await bodyOf(req);
      return json(await methodLab(String(body.idea ?? ""), body.topic ? String(body.topic) : undefined));
    }
    if (root === "datasets" && method === "GET") return json(repo.listDatasets(databaseNow, userId));
    if (root === "datasets" && method === "POST") return uploadDataset(req, userId);
    if (root === "stats" && method === "POST") return analyze(userId, await bodyOf(req));
    if (root === "analyses") return json(repo.listAnalyses(databaseNow, userId));
    if (root === "qual" && !a && method === "GET") return json(repo.listQual(databaseNow, userId));
    if (root === "qual" && !a && method === "POST") {
      const body = await bodyOf(req);
      return json(repo.createQual(databaseNow, userId, String(body.title ?? "質性研究"), body.projectId ? String(body.projectId) : undefined));
    }
    if (root === "qual" && a && !b && method === "GET") {
      const qual = repo.getQual(databaseNow, userId, a);
      return qual ? json(qual) : fail(404, "找不到質性研究");
    }
    if (root === "qual" && b === "transcripts" && method === "POST") return json(repo.addTranscript(databaseNow, userId, a, await bodyOf(req)));
    if (root === "qual" && b === "codes" && method === "POST") return json(repo.addCode(databaseNow, userId, a, await bodyOf(req)));
    if (root === "qual" && b === "themes" && method === "POST") return json(repo.addTheme(databaseNow, userId, a, await bodyOf(req)));
    if (root === "qual" && b === "suggest" && method === "POST") {
      const body = await bodyOf(req);
      return json(await suggestCodes(databaseNow, userId, a, String(body.transcriptId ?? "")));
    }
    if (root === "codes" && b === "accept") {
      const body = await bodyOf(req);
      repo.acceptCode(databaseNow, userId, a, Boolean(body.accepted));
      return json({ ok: true });
    }
    if (root === "focus" && !a && method === "POST") return json(repo.startFocus(databaseNow, userId, await bodyOf(req)));
    if (root === "focus" && b === "end") return json(repo.endFocus(databaseNow, userId, a, String((await bodyOf(req)).reflection ?? "")));
    if (root === "official" && method === "GET") return json(repo.listOfficial(databaseNow, userId));
    if (root === "official" && a === "sync") return syncOfficial(userId);
    if (root === "integrations") return integrations(req, method, userId, parts.slice(1));
    if (root === "memories") return json(repo.listMemories(databaseNow, userId));
    return fail(404, "沒有這個功能", "not_found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "沒有完成";
    return fail(400, message);
  }
}

async function auth(req: Request, method: string, parts: string[]): Promise<Response> {
  const [action, sub] = parts;
  const origin = originOf(req);
  if (action === "providers") {
    const sso = tkuStatus();
    return json({ ...sso, probe: await probeTku(), google: googleConfigured(), dev: devLoginAllowed(), email: Boolean(process.env.RESEND_API_KEY) });
  }
  if (action === "dev" && method === "POST") {
    if (!devLoginAllowed()) return fail(403, "正式環境沒有打開開發登入");
    const body = await bodyOf(req);
    const name = String(body.name || "研究生").slice(0, 40);
    const email = body.email ? String(body.email) : null;
    const user = repo.createUser(database(), { name, email, provider: "development", subject: `dev:${email || name}` });
    const token = await sealSession(repo.createSession(database(), String(user.id)));
    return json({ user }, 200, { "set-cookie": sessionCookie(token) });
  }
  if (action === "logout") {
    const sid = await readSid(req.headers.get("cookie"));
    if (sid) repo.deleteSession(database(), sid);
    return json({ ok: true }, 200, { "set-cookie": sessionCookie("", true) });
  }
  if (action === "me") {
    const user = await userFrom(req);
    if (!user) return fail(401, "請先登入");
    return json({ user, profile: repo.getProfile(database(), String(user.id)), settings: repo.getSettings(database(), String(user.id)) });
  }
  if (action === "google" && !sub) {
    if (!googleConfigured()) return fail(400, "還沒設定 Google OAuth client");
    const purpose = new URL(req.url).searchParams.get("purpose") === "connect" ? "connect" : "login";
    const current = await userFrom(req);
    const state = repo.putOauthState(database(), "google", { purpose, verifier: "n/a" }, current ? String(current.id) : undefined);
    return Response.redirect(googleAuthUrl(origin, state, purpose));
  }
  if (action === "google" && sub === "callback") {
    const query = new URL(req.url).searchParams;
    const state = repo.takeOauthState(database(), query.get("state") || "");
    if (!state) return fail(400, "登入狀態過期");
    const exchanged = await googleExchange(origin, query.get("code") || "");
    const payload = JSON.parse(String(state.payload_json)) as { purpose?: string };
    if (payload.purpose === "connect" && state.user_id) {
      repo.saveIntegration(database(), String(state.user_id), "google", {
        accessToken: seal(exchanged.accessToken),
        refreshToken: exchanged.refreshToken ? seal(exchanged.refreshToken) : null,
        expiresAt: exchanged.expiresAt,
        email: exchanged.email,
        scopes: "drive calendar gmail",
      });
      return Response.redirect(`${origin}/more?connected=google`);
    }
    const user = repo.createUser(database(), { name: exchanged.name || "Google 同學", email: exchanged.email, provider: "google", subject: exchanged.sub || exchanged.email || exchanged.accessToken.slice(0, 12) });
    repo.saveIntegration(database(), String(user.id), "google", { accessToken: seal(exchanged.accessToken), refreshToken: exchanged.refreshToken ? seal(exchanged.refreshToken) : null, expiresAt: exchanged.expiresAt, email: exchanged.email });
    const token = await sealSession(repo.createSession(database(), String(user.id)));
    return new Response(null, { status: 302, headers: { location: `${origin}/today`, "set-cookie": sessionCookie(token) } });
  }
  if (action === "tku" && !sub) {
    const status = tkuStatus();
    if (!status.configured) return json({ ...status, probe: await probeTku() }, 409);
    const verifier = pkceVerifier();
    const state = repo.putOauthState(database(), "tku-sso", { verifier });
    return Response.redirect(await tkuAuthorizeUrl(origin, state, verifier));
  }
  if (action === "tku" && sub === "callback") {
    const query = new URL(req.url).searchParams;
    const state = repo.takeOauthState(database(), query.get("state") || "");
    if (!state) return fail(400, "SSO 狀態過期");
    const payload = JSON.parse(String(state.payload_json)) as { verifier: string };
    const profile = await tkuExchange(origin, query.get("code") || "", payload.verifier);
    const user = repo.createUser(database(), { name: profile.name, email: profile.email, provider: "tku-sso", subject: profile.subject, profile: profile.raw });
    const token = await sealSession(repo.createSession(database(), String(user.id)));
    return new Response(null, { status: 302, headers: { location: `${origin}/today`, "set-cookie": sessionCookie(token) } });
  }
  if (action === "email" && sub === "start") {
    const email = String((await bodyOf(req)).email || "");
    if (!email.includes("@")) return fail(400, "信箱看起來不對");
    const token = repo.putOauthState(database(), "email", { email });
    const link = `${origin}/api/auth/email/verify?token=${token}`;
    if (process.env.RESEND_API_KEY) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM || "TKU EduPsy <onboarding@resend.dev>", to: email, subject: "進入研究室", text: `登入連結：${link}\n10 分鐘內有效。` }),
      });
      return json({ ok: true, delivered: true });
    }
    console.info(`[edupsy] magic link for ${email}: ${link}`);
    return json({ ok: true, delivered: false, devLink: process.env.NODE_ENV === "production" ? undefined : link });
  }
  if (action === "email" && sub === "verify") {
    const state = repo.takeOauthState(database(), new URL(req.url).searchParams.get("token") || "");
    if (!state) return fail(400, "連結失效");
    const payload = JSON.parse(String(state.payload_json)) as { email: string };
    const user = repo.createUser(database(), { name: payload.email.split("@")[0], email: payload.email, provider: "email", subject: payload.email });
    const token = await sealSession(repo.createSession(database(), String(user.id)));
    return new Response(null, { status: 302, headers: { location: `${origin}/today`, "set-cookie": sessionCookie(token) } });
  }
  return fail(404, "沒有這個登入方式");
}

async function uploadPaper(req: Request, userId: string) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "沒有檔案");
  if (file.size > 25 * 1024 * 1024) return fail(400, "檔案超過 25MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const saved = await ingestFile(database(), userId, { filename: file.name, mime: file.type || "application/octet-stream", bytes }, { projectId: String(form.get("projectId") || "") || undefined, courseId: String(form.get("courseId") || "") || undefined });
  const enriched = await enrichPaper(database(), userId, String(saved.paperId)).catch((error) => ({ error: error instanceof Error ? error.message : "AI 摘要稍後再試", paper: repo.getPaper(database(), userId, String(saved.paperId)) }));
  return json({ ...saved, enriched });
}

async function importCitations(userId: string, body: Record<string, unknown>) {
  const format = String(body.format || "ris");
  const raw = String(body.raw || "");
  const created = [];
  if (format === "bibtex") {
    for (const item of parseBibtex(raw)) {
      const authors = bibtexAuthors(item.author);
      const scholarly = item.doi ? await lookupDoi(item.doi) : null;
      const paper = repo.createPaper(database(), userId, {
        title: scholarly?.title || item.title || "未命名",
        year: scholarly?.year || Number(item.year) || null,
        journal: scholarly?.journal || item.journal,
        doi: item.doi,
        authors: (scholarly?.authors || authors).map((author) => author.family),
        abstract: scholarly?.abstract,
      });
      repo.saveCitation(database(), userId, String(paper.id), { doi: item.doi, apa7: scholarly?.apa7 || apa7({ authors, year: Number(item.year) || null, title: item.title || "", journal: item.journal, doi: item.doi }), source: scholarly ? scholarly.source : "import", verified: Boolean(scholarly), raw: item });
      created.push(paper.id);
    }
  } else {
    for (const item of parseRis(raw)) {
      const title = String(item.TI || item.T1 || "未命名");
      const doi = item.DO ? String(item.DO) : undefined;
      const scholarly = doi ? await lookupDoi(doi) : null;
      const paper = repo.createPaper(database(), userId, { title: scholarly?.title || title, year: scholarly?.year || Number(item.PY) || null, doi, authors: scholarly?.authors.map((author) => author.family) || (Array.isArray(item.AU) ? item.AU : []), abstract: scholarly?.abstract || item.AB });
      repo.saveCitation(database(), userId, String(paper.id), { doi, apa7: scholarly?.apa7 ?? null, source: scholarly ? scholarly.source : "import", verified: Boolean(scholarly), raw: item });
      if (!scholarly) repo.saveCitation(database(), userId, String(paper.id), { source: "none", verified: false, apa7: null, raw: { message: "未找到可靠來源" } });
      created.push(paper.id);
    }
  }
  return json({ created, note: created.length ? "已匯入。沒有對到 DOI 的項目不會被寫成正式 APA。" : "沒有解析到文獻" });
}

async function weekly(userId: string) {
  const since = addDays(new Date(), -7).toISOString();
  const facts = repo.weeklyFacts(database(), userId, since);
  return json({ since, facts, narrative: null, label: "這些數字來自你的資料庫，不是 AI 估計。" });
}

async function analyze(userId: string, body: Record<string, unknown>) {
  const dataset = body.datasetId ? repo.getDataset(database(), userId, String(body.datasetId)) : null;
  const rows = dataset ? JSON.parse(String(dataset.preview_json || "[]")) as Record<string, unknown>[] : Array.isArray(body.rows) ? body.rows as Record<string, unknown>[] : [];
  const design = String(body.design || "");
  const suggestion = suggestMethod({ design, groups: Number(body.groups || 0), paired: Boolean(body.paired), predictors: Array.isArray(body.predictors) ? body.predictors.length : 0, outcome: body.outcome === "categorical" ? "categorical" : "continuous" });
  const method = String(body.method || "descriptive");
  let result;
  if (method === "pearson") result = pearson(columnNumbers(rows, String(body.x)), columnNumbers(rows, String(body.y)));
  else if (method === "welch") result = welchT(columnNumbers(rows, String(body.a)), columnNumbers(rows, String(body.b)));
  else if (method === "paired") result = pairedT(columnNumbers(rows, String(body.a)), columnNumbers(rows, String(body.b)));
  else if (method === "anova") result = oneWayAnova((Array.isArray(body.groups) ? body.groups : []).map((name) => columnNumbers(rows, String(name))));
  else if (method === "cronbach") result = cronbach((Array.isArray(body.items) ? body.items : []).map((name) => columnNumbers(rows, String(name))));
  else if (method === "regression") result = linearRegression(columnNumbers(rows, String(body.y)), (Array.isArray(body.predictors) ? body.predictors : []).map((name) => columnNumbers(rows, String(name))));
  else result = descriptive(columnNumbers(rows, String(body.column || Object.keys(rows[0] || {})[0] || "")));
  const id = repo.saveAnalysis(database(), userId, { datasetId: body.datasetId, method: result.method, designNote: design, assumptions: result.assumptions.join("；"), result: result.numbers, apa: result.apa, limitations: result.limitations.join("；"), interpretation: result.refused || suggestion });
  return json({ suggestion, result, analysisId: id, privacy: "資料集預設是敏感資料，不會進一般聊天上下文。" });
}

async function uploadDataset(req: Request, userId: string) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail(400, "沒有資料檔");
  const text = await file.text();
  const parsed = parseCsv(text);
  const datasetId = repo.createDataset(database(), userId, { title: file.name, filename: file.name, columns: parsed.columns, rowCount: parsed.rows.length, preview: parsed.rows.slice(0, 2000), projectId: form.get("projectId") });
  return json({ datasetId, columns: parsed.columns, rowCount: parsed.rows.length, preview: parsed.rows.slice(0, 8) });
}

async function syncOfficial(userId: string) {
  const items = await fetchOfficial();
  const changes = items.map((item) => ({ ...item, ...repo.saveOfficial(database(), userId, item) }));
  return json({ count: items.length, changed: changes.filter((item) => item.changed).map((item) => item.title), sources: repo.listOfficial(database(), userId) });
}

async function reviewCourse(userId: string, courseId: string) {
  const course = repo.getCourse(database(), userId, courseId);
  if (!course) return fail(404, "找不到課程");
  const { complete, parseJsonBlock } = await import("../ai/provider");
  const notes = (course.notes as Array<{ body: string }> | undefined)?.map((note) => note.body).join("\n") || "還沒有筆記";
  const raw = await complete({
    reasoning: true,
    json: true,
    messages: [
      { role: "system", content: "整理課堂筆記。區分老師原文與你的推論。不要把可能考點寫成一定會考。回傳 JSON：taught, theories, scholars, terms, emphasized, maybeExam, researchQuestions, flashcards:[{front,back}]。" },
      { role: "user", content: `課程：${course.name}\n${notes}` },
    ],
  });
  const parsed = parseJsonBlock(raw) ?? { unverified: raw };
  const cards = Array.isArray(parsed.flashcards) ? parsed.flashcards as Array<{ front: string; back: string }> : [];
  repo.addFlashcards(database(), userId, courseId, cards.filter((card) => card.front && card.back).slice(0, 12));
  repo.createNote(database(), userId, { title: `${course.name} 課後整理`, body: `【AI 整理】\n${JSON.stringify(parsed, null, 2)}`, kind: "course", courseId, source: "ai" });
  return json(parsed);
}

async function integrations(req: Request, method: string, userId: string, parts: string[]) {
  const [name, action] = parts;
  if (!name) {
    const google = repo.getIntegration(database(), userId, "google");
    const zotero = repo.getIntegration(database(), userId, "zotero");
    return json({ google: Boolean(google), googleEmail: google?.external_email ?? null, zotero: Boolean(zotero), configured: { google: googleConfigured(), tku: tkuStatus().configured } });
  }
  if (name === "drive" && action === "sync") {
    const token = await googleAccess(userId);
    const files = await driveList(token);
    let indexed = 0;
    for (const file of files) {
      const known = repo.listDriveFiles(database(), userId).find((item) => item.drive_id === file.id);
      repo.upsertDriveFile(database(), userId, { driveId: file.id, name: file.name, mime: file.mimeType, modifiedTime: file.modifiedTime, indexedAt: known?.last_indexed_at });
      const changed = !known || known.modified_time !== file.modifiedTime;
      if (changed && /pdf|word|text|presentation/.test(file.mimeType) && indexed < 5) {
        const bytes = await driveDownload(token, file.id);
        await ingestFile(database(), userId, { filename: file.name, mime: file.mimeType, bytes });
        repo.upsertDriveFile(database(), userId, { driveId: file.id, name: file.name, mime: file.mimeType, modifiedTime: file.modifiedTime, indexedAt: new Date().toISOString() });
        indexed += 1;
      }
    }
    return json({ files: repo.listDriveFiles(database(), userId), indexed });
  }
  if (name === "calendar" && action === "sync") {
    const token = await googleAccess(userId);
    const events = await calendarList(token);
    for (const event of events) {
      const starts = event.start?.dateTime || event.start?.date;
      if (!starts || !event.summary) continue;
      const existing = repo.listEvents(database(), userId).find((item) => item.external_id === event.id);
      if (!existing) repo.createEvent(database(), userId, { title: event.summary, startsAt: new Date(starts).toISOString(), endsAt: event.end?.dateTime, location: event.location, kind: "personal", source: "google", externalId: event.id });
    }
    return json(repo.listEvents(database(), userId));
  }
  if (name === "gmail" && action === "sync") {
    const token = await googleAccess(userId);
    const messages = await gmailList(token);
    for (const message of messages) repo.cacheEmail(database(), userId, { ...message, category: classifyMail(message.from, message.subject) });
    return json(repo.listEmail(database(), userId));
  }
  if (name === "gmail" && action === "draft" && method === "POST") {
    const body = await bodyOf(req);
    if (body.confirm !== "建立草稿") return fail(400, "寄出或存草稿前需要你確認。請傳 confirm: 建立草稿。這個動作只建立草稿，不會寄出。");
    const token = await googleAccess(userId);
    const draft = await gmailDraft(token, { to: String(body.to || ""), subject: String(body.subject || ""), body: String(body.body || "") });
    repo.audit(database(), userId, "gmail.draft", "email", draft.id, String(body.subject || ""));
    return json({ draft, sent: false });
  }
  if (name === "zotero" && action === "import" && method === "POST") {
    const body = await bodyOf(req);
    const user = String(body.user || process.env.ZOTERO_USER_ID || "");
    const key = String(body.key || process.env.ZOTERO_API_KEY || "");
    if (!user || !key) return fail(400, "需要 Zotero user id 與 API key");
    repo.saveIntegration(database(), userId, "zotero", { accessToken: seal(key), meta: { user } });
    const items = await fetch(`https://api.zotero.org/users/${user}/items?format=json&limit=25&itemType=journalArticle`, { headers: { "Zotero-API-Key": key } }).then((res) => res.json());
    const created = [];
    for (const item of Array.isArray(items) ? items : []) {
      const data = item.data ?? {};
      if (!data.title) continue;
      const scholarly = data.DOI ? await lookupDoi(data.DOI) : null;
      const paper = repo.createPaper(database(), userId, { title: scholarly?.title || data.title, year: scholarly?.year || data.date, doi: data.DOI, authors: scholarly?.authors.map((author) => author.family) || (data.creators ?? []).map((creator: { lastName?: string; name?: string }) => creator.lastName || creator.name) });
      repo.saveCitation(database(), userId, String(paper.id), { doi: data.DOI, apa7: scholarly?.apa7 ?? null, source: scholarly ? scholarly.source : "zotero", verified: Boolean(scholarly), raw: data.DOI ? scholarly : { message: "未找到可靠來源" } });
      created.push(paper.id);
    }
    return json({ created });
  }
  return fail(404, "沒有這個連接");
}

export function readStoredFile(userId: string, relativePath: string): Buffer {
  const full = path.resolve(path.join(process.cwd(), "data", relativePath));
  if (!full.includes(userId)) throw new Error("不能讀別人的檔案");
  return readFileSync(full);
}
