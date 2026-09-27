import { createHash } from "node:crypto";
import { one, rows, run, transaction, type Sql } from "./db";
import { extractKeywords } from "./domain/capture";
import { THESIS_STAGES } from "./domain/catalog";
import { id } from "./ids";
import { nowIso, taipeiParts } from "./time";

export type Row = Record<string, unknown>;

export function j<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stamp(): string {
  return nowIso();
}

export function createUser(db: Sql, input: { name: string; email?: string | null; provider: string; subject: string; profile?: unknown }): Row {
  return transaction(db, () => {
    const existing = one<Row>(db, "SELECT user_id FROM auth_identities WHERE provider = ? AND subject = ?", input.provider, input.subject);
    if (existing) {
      const user = one<Row>(db, "SELECT * FROM users WHERE id = ?", existing.user_id);
      if (input.email && user && !user.email) run(db, "UPDATE users SET email = ?, updated_at = ? WHERE id = ?", input.email, stamp(), user.id);
      return user ?? { id: existing.user_id };
    }
    const userId = id();
    const at = stamp();
    run(db, "INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", userId, input.email ?? null, input.name, at, at);
    run(db, "INSERT INTO auth_identities (id, user_id, provider, subject, email, profile_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id(), userId, input.provider, input.subject, input.email ?? null, JSON.stringify(input.profile ?? {}), at);
    run(db, "INSERT INTO settings (user_id, updated_at) VALUES (?, ?)", userId, at);
    run(db, "INSERT INTO student_profiles (user_id, department, program, updated_at) VALUES (?, ?, ?, ?)", userId, "教育心理與諮商研究所", "碩士班", at);
    return one<Row>(db, "SELECT * FROM users WHERE id = ?", userId)!;
  });
}

export function createSession(db: Sql, userId: string, days = 30): string {
  const sid = id();
  const at = stamp();
  const exp = new Date(Date.now() + days * 86400000).toISOString();
  run(db, "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)", sid, userId, exp, at);
  return sid;
}

export function userFromSession(db: Sql, sid: string): Row | null {
  const session = one<Row>(db, "SELECT * FROM sessions WHERE id = ?", sid);
  if (!session) return null;
  if (String(session.expires_at) < stamp()) {
    run(db, "DELETE FROM sessions WHERE id = ?", sid);
    return null;
  }
  return one<Row>(db, "SELECT * FROM users WHERE id = ?", session.user_id);
}

export function deleteSession(db: Sql, sid: string): void {
  run(db, "DELETE FROM sessions WHERE id = ?", sid);
}

export function getSettings(db: Sql, userId: string): Row {
  return one<Row>(db, "SELECT * FROM settings WHERE user_id = ?", userId) ?? { user_id: userId, disclosure: "starter", cat_visible: 1, cat_animation: 1, socratic: 1, privacy_mode: 1, ai_include_sensitive: 0, mode: "research", night: 0, pinned_modules: "[]" };
}

export function updateSettings(db: Sql, userId: string, patch: Record<string, unknown>): Row {
  const current = getSettings(db, userId);
  const next = { ...current, ...patch, user_id: userId, updated_at: stamp() } as Record<string, unknown>;
  run(
    db,
    `INSERT INTO settings (user_id, disclosure, cat_visible, cat_animation, socratic, privacy_mode, ai_include_sensitive, mode, night, pinned_modules, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       disclosure=excluded.disclosure, cat_visible=excluded.cat_visible, cat_animation=excluded.cat_animation,
       socratic=excluded.socratic, privacy_mode=excluded.privacy_mode, ai_include_sensitive=excluded.ai_include_sensitive,
       mode=excluded.mode, night=excluded.night, pinned_modules=excluded.pinned_modules, updated_at=excluded.updated_at`,
    userId,
    next.disclosure,
    next.cat_visible ? 1 : 0,
    next.cat_animation ? 1 : 0,
    next.socratic ? 1 : 0,
    next.privacy_mode ? 1 : 0,
    next.ai_include_sensitive ? 1 : 0,
    next.mode,
    next.night ? 1 : 0,
    typeof next.pinned_modules === "string" ? next.pinned_modules : JSON.stringify(next.pinned_modules ?? []),
    next.updated_at,
  );
  return getSettings(db, userId);
}

export function getProfile(db: Sql, userId: string): Row | null {
  return one<Row>(db, "SELECT * FROM student_profiles WHERE user_id = ?", userId);
}

export function saveOnboarding(db: Sql, userId: string, input: Record<string, unknown>): Row {
  const at = stamp();
  run(
    db,
    `UPDATE student_profiles SET student_id=?, year_level=?, semester_label=?, advisor=?, has_advisor=?, research_interest=?, thesis_direction=?, email=?, onboarded_at=?, updated_at=? WHERE user_id=?`,
    input.studentId ?? null,
    input.yearLevel ?? null,
    input.semesterLabel ?? null,
    input.advisor ?? null,
    input.hasAdvisor ? 1 : 0,
    input.researchInterest ?? null,
    input.thesisDirection ?? null,
    input.email ?? null,
    at,
    at,
    userId,
  );
  if (input.researchInterest || input.thesisDirection) {
    const title = String(input.thesisDirection || input.researchInterest || "我的研究");
    const existing = one<Row>(db, "SELECT id FROM research_projects WHERE user_id = ? ORDER BY created_at LIMIT 1", userId);
    if (!existing) createProject(db, userId, { title, topic: String(input.researchInterest ?? "") });
  }
  if (Array.isArray(input.courses)) {
    for (const course of input.courses) {
      if (course && typeof course === "object" && "name" in course && course.name) {
        createCourse(db, userId, course as Record<string, unknown>);
      }
    }
  }
  return getProfile(db, userId)!;
}

export function upsertSearch(db: Sql, userId: string, entityType: string, entityId: string, title: string, body: string, sensitivity = "normal"): void {
  const sid = `${userId}:${entityType}:${entityId}`;
  run(
    db,
    `INSERT INTO search_docs (id, user_id, entity_type, entity_id, title, body, sensitivity, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, body=excluded.body, sensitivity=excluded.sensitivity, updated_at=excluded.updated_at`,
    sid,
    userId,
    entityType,
    entityId,
    title.slice(0, 300),
    body.slice(0, 8000),
    sensitivity,
    stamp(),
  );
}

export function removeSearch(db: Sql, userId: string, entityType: string, entityId: string): void {
  run(db, "DELETE FROM search_docs WHERE id = ?", `${userId}:${entityType}:${entityId}`);
}

export function search(db: Sql, userId: string, query: string, includeSensitive = false): Row[] {
  const q = query.trim();
  if (!q) return [];
  const sensitivity = includeSensitive ? "" : "AND sensitivity = 'normal'";
  if (q.length >= 3) {
    const match = `"${q.replace(/"/g, " ")}"`;
    const fts = rows<Row>(
      db,
      `SELECT d.entity_type, d.entity_id, d.title, substr(d.body, 1, 180) AS snippet
       FROM search_fts f JOIN search_docs d ON d.rowid = f.rowid
       WHERE search_fts MATCH ? AND d.user_id = ? ${sensitivity}
       ORDER BY rank LIMIT 40`,
      match,
      userId,
    );
    if (fts.length) return fts;
  }
  return rows<Row>(
    db,
    `SELECT entity_type, entity_id, title, substr(body, 1, 180) AS snippet
     FROM search_docs WHERE user_id = ? ${sensitivity} AND (title LIKE ? OR body LIKE ?)
     ORDER BY updated_at DESC LIMIT 40`,
    userId,
    `%${q}%`,
    `%${q}%`,
  );
}

export function touchNode(db: Sql, userId: string, kind: string, label: string, refType?: string, refId?: string): string {
  const normalized = label.trim().toLowerCase();
  const existing = one<Row>(db, "SELECT id FROM knowledge_nodes WHERE user_id = ? AND kind = ? AND normalized = ?", userId, kind, normalized);
  if (existing) return String(existing.id);
  const nodeId = id();
  run(db, "INSERT INTO knowledge_nodes (id, user_id, kind, label, normalized, ref_type, ref_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", nodeId, userId, kind, label.trim(), normalized, refType ?? null, refId ?? null, stamp());
  return nodeId;
}

export function linkNodes(db: Sql, userId: string, fromId: string, toId: string, relation: string, origin = "system"): void {
  if (fromId === toId) return;
  run(
    db,
    `INSERT INTO knowledge_edges (id, user_id, from_id, to_id, relation, origin, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, from_id, to_id, relation) DO NOTHING`,
    id(),
    userId,
    fromId,
    toId,
    relation,
    origin,
    stamp(),
  );
}

export function linkKeywords(db: Sql, userId: string, text: string, refType: string, refId: string, label: string): void {
  const hub = touchNode(db, userId, refType === "paper" ? "paper" : refType === "course" ? "course" : "note", label, refType, refId);
  for (const keyword of extractKeywords(text)) {
    const node = touchNode(db, userId, "concept", keyword);
    linkNodes(db, userId, hub, node, "mentions");
  }
}

export function listGraph(db: Sql, userId: string): { nodes: Row[]; edges: Row[] } {
  return {
    nodes: rows<Row>(db, "SELECT * FROM knowledge_nodes WHERE user_id = ? ORDER BY created_at DESC LIMIT 200", userId),
    edges: rows<Row>(db, "SELECT * FROM knowledge_edges WHERE user_id = ? ORDER BY created_at DESC LIMIT 400", userId),
  };
}

export function addRevision(db: Sql, userId: string, entityType: string, entityId: string, snapshot: unknown): number {
  const last = one<Row>(db, "SELECT MAX(version) AS v FROM revisions WHERE user_id = ? AND entity_type = ? AND entity_id = ?", userId, entityType, entityId);
  const version = Number(last?.v ?? 0) + 1;
  run(db, "INSERT INTO revisions (id, user_id, entity_type, entity_id, version, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id(), userId, entityType, entityId, version, JSON.stringify(snapshot), stamp());
  return version;
}

export function listRevisions(db: Sql, userId: string, entityType: string, entityId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM revisions WHERE user_id = ? AND entity_type = ? AND entity_id = ? ORDER BY version", userId, entityType, entityId);
}

export function audit(db: Sql, userId: string, action: string, entityType?: string, entityId?: string, detail?: string): void {
  run(db, "INSERT INTO audit_log (id, user_id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id(), userId, action, entityType ?? null, entityId ?? null, detail ?? null, stamp());
}

export function createCourse(db: Sql, userId: string, input: Record<string, unknown>): Row {
  const courseId = id();
  const at = stamp();
  run(
    db,
    `INSERT INTO courses (id, user_id, name, instructor, schedule, weekday, start_time, end_time, location, credits, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    courseId,
    userId,
    String(input.name),
    input.instructor ?? null,
    input.schedule ?? null,
    input.weekday ?? null,
    input.startTime ?? input.start_time ?? null,
    input.endTime ?? input.end_time ?? null,
    input.location ?? null,
    input.credits ?? null,
    input.color ?? "#6d97a8",
    at,
    at,
  );
  const course = one<Row>(db, "SELECT * FROM courses WHERE id = ? AND user_id = ?", courseId, userId)!;
  upsertSearch(db, userId, "course", courseId, String(course.name), `${course.instructor ?? ""} ${course.schedule ?? ""}`);
  linkKeywords(db, userId, String(course.name), "course", courseId, String(course.name));
  return course;
}

export function listCourses(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM courses WHERE user_id = ? ORDER BY weekday, start_time, name", userId);
}

export function getCourse(db: Sql, userId: string, courseId: string): Row | null {
  const course = one<Row>(db, "SELECT * FROM courses WHERE id = ? AND user_id = ?", courseId, userId);
  if (!course) return null;
  return {
    ...course,
    materials: rows<Row>(db, "SELECT * FROM course_materials WHERE course_id = ? AND user_id = ? ORDER BY created_at DESC", courseId, userId),
    notes: rows<Row>(db, "SELECT * FROM notes WHERE course_id = ? AND user_id = ? ORDER BY updated_at DESC", courseId, userId),
    tasks: rows<Row>(db, "SELECT * FROM tasks WHERE course_id = ? AND user_id = ? ORDER BY due_at", courseId, userId),
    flashcards: rows<Row>(db, "SELECT * FROM flashcards WHERE course_id = ? AND user_id = ? ORDER BY created_at DESC", courseId, userId),
  };
}

export function addMaterial(db: Sql, userId: string, courseId: string, input: Record<string, unknown>): Row {
  const owned = one<Row>(db, "SELECT id FROM courses WHERE id = ? AND user_id = ?", courseId, userId);
  if (!owned) throw new Error("找不到這門課");
  const materialId = id();
  run(db, "INSERT INTO course_materials (id, user_id, course_id, title, kind, url, document_id, due_at, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", materialId, userId, courseId, String(input.title), String(input.kind ?? "reading"), input.url ?? null, input.documentId ?? null, input.dueAt ?? null, input.notes ?? null, stamp());
  if (input.dueAt) {
    createTask(db, userId, { title: String(input.title), dueAt: input.dueAt, courseId, priority: 1 });
  }
  return one<Row>(db, "SELECT * FROM course_materials WHERE id = ? AND user_id = ?", materialId, userId)!;
}

export function createNote(db: Sql, userId: string, input: Record<string, unknown>): Row {
  const noteId = id();
  const at = stamp();
  const body = String(input.body ?? "");
  const title = String(input.title ?? body.slice(0, 32));
  run(
    db,
    `INSERT INTO notes (id, user_id, title, body, kind, course_id, project_id, paper_id, meeting_id, sensitivity, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    noteId,
    userId,
    title,
    body,
    input.kind ?? "capture",
    input.courseId ?? null,
    input.projectId ?? null,
    input.paperId ?? null,
    input.meetingId ?? null,
    input.sensitivity ?? "normal",
    input.source ?? "user",
    at,
    at,
  );
  upsertSearch(db, userId, "note", noteId, title, body, String(input.sensitivity ?? "normal"));
  linkKeywords(db, userId, `${title}\n${body}`, "note", noteId, title);
  return one<Row>(db, "SELECT * FROM notes WHERE id = ? AND user_id = ?", noteId, userId)!;
}

export function listNotes(db: Sql, userId: string, kind?: string): Row[] {
  if (kind) return rows<Row>(db, "SELECT * FROM notes WHERE user_id = ? AND kind = ? ORDER BY updated_at DESC", userId, kind);
  return rows<Row>(db, "SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC", userId);
}

export function getNote(db: Sql, userId: string, noteId: string): Row | null {
  return one<Row>(db, "SELECT * FROM notes WHERE id = ? AND user_id = ?", noteId, userId);
}

export function updateNote(db: Sql, userId: string, noteId: string, patch: Record<string, unknown>): Row | null {
  const current = getNote(db, userId, noteId);
  if (!current) return null;
  const title = patch.title ?? current.title;
  const body = patch.body ?? current.body;
  const kind = patch.kind ?? current.kind;
  const sensitivity = patch.sensitivity ?? current.sensitivity;
  run(db, "UPDATE notes SET title=?, body=?, kind=?, sensitivity=?, updated_at=? WHERE id=? AND user_id=?", title, body, kind, sensitivity, stamp(), noteId, userId);
  upsertSearch(db, userId, "note", noteId, String(title), String(body), String(sensitivity));
  return getNote(db, userId, noteId);
}

export function createTask(db: Sql, userId: string, input: Record<string, unknown>): Row {
  const taskId = id();
  const at = stamp();
  run(
    db,
    `INSERT INTO tasks (id, user_id, title, detail, status, due_at, course_id, project_id, meeting_id, paper_id, priority, source_note_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    taskId,
    userId,
    String(input.title),
    input.detail ?? null,
    input.dueAt ?? input.due_at ?? null,
    input.courseId ?? null,
    input.projectId ?? null,
    input.meetingId ?? null,
    input.paperId ?? null,
    input.priority ?? 2,
    input.sourceNoteId ?? null,
    at,
    at,
  );
  upsertSearch(db, userId, "task", taskId, String(input.title), String(input.detail ?? ""));
  return one<Row>(db, "SELECT * FROM tasks WHERE id = ? AND user_id = ?", taskId, userId)!;
}

export function listTasks(db: Sql, userId: string, status = "open"): Row[] {
  if (status === "all") return rows<Row>(db, "SELECT * FROM tasks WHERE user_id = ? ORDER BY due_at IS NULL, due_at, priority", userId);
  return rows<Row>(db, "SELECT * FROM tasks WHERE user_id = ? AND status = ? ORDER BY due_at IS NULL, due_at, priority", userId, status);
}

export function updateTask(db: Sql, userId: string, taskId: string, patch: Record<string, unknown>): Row | null {
  const current = one<Row>(db, "SELECT * FROM tasks WHERE id = ? AND user_id = ?", taskId, userId);
  if (!current) return null;
  run(
    db,
    "UPDATE tasks SET title=?, detail=?, status=?, due_at=?, priority=?, updated_at=? WHERE id=? AND user_id=?",
    patch.title ?? current.title,
    patch.detail ?? current.detail,
    patch.status ?? current.status,
    patch.dueAt ?? patch.due_at ?? current.due_at,
    patch.priority ?? current.priority,
    stamp(),
    taskId,
    userId,
  );
  return one<Row>(db, "SELECT * FROM tasks WHERE id = ?", taskId);
}

export function createEvent(db: Sql, userId: string, input: Record<string, unknown>): Row {
  const eventId = id();
  run(db, "INSERT INTO events (id, user_id, title, starts_at, ends_at, kind, course_id, location, external_id, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", eventId, userId, String(input.title), String(input.startsAt ?? input.starts_at), input.endsAt ?? input.ends_at ?? null, input.kind ?? "personal", input.courseId ?? null, input.location ?? null, input.externalId ?? null, input.source ?? "local", stamp());
  upsertSearch(db, userId, "event", eventId, String(input.title), String(input.kind ?? ""));
  return one<Row>(db, "SELECT * FROM events WHERE id = ? AND user_id = ?", eventId, userId)!;
}

export function listEvents(db: Sql, userId: string, from?: string, to?: string): Row[] {
  if (from && to) return rows<Row>(db, "SELECT * FROM events WHERE user_id = ? AND starts_at >= ? AND starts_at < ? ORDER BY starts_at", userId, from, to);
  return rows<Row>(db, "SELECT * FROM events WHERE user_id = ? ORDER BY starts_at", userId);
}

export function createMeeting(db: Sql, userId: string, input: Record<string, unknown>): Row {
  const meetingId = id();
  const at = stamp();
  const body = String(input.body ?? "");
  run(
    db,
    `INSERT INTO meetings (id, user_id, title, kind, happened_at, participants, body, decisions, teacher_feedback, project_id, course_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    meetingId,
    userId,
    String(input.title ?? "討論紀錄"),
    input.kind ?? "advisor",
    String(input.happenedAt ?? input.happened_at ?? at),
    input.participants ?? null,
    body,
    input.decisions ?? null,
    input.teacherFeedback ?? input.teacher_feedback ?? null,
    input.projectId ?? null,
    input.courseId ?? null,
    at,
    at,
  );
  upsertSearch(db, userId, "meeting", meetingId, String(input.title ?? "討論紀錄"), body);
  const note = createNote(db, userId, { title: String(input.title ?? "討論紀錄"), body, kind: "meeting", meetingId, projectId: input.projectId, courseId: input.courseId, source: "user" });
  return { ...one<Row>(db, "SELECT * FROM meetings WHERE id = ?", meetingId)!, note_id: note.id };
}

export function listMeetings(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM meetings WHERE user_id = ? ORDER BY happened_at DESC", userId);
}

export function createIdea(db: Sql, userId: string, rawText: string, projectId?: string | null): Row {
  const ideaId = id();
  const keywords = extractKeywords(rawText);
  run(db, "INSERT INTO research_ideas (id, user_id, raw_text, keywords, project_id, related_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", ideaId, userId, rawText, keywords.join("、"), projectId ?? null, "[]", stamp());
  createNote(db, userId, { title: rawText.slice(0, 32), body: rawText, kind: "idea", projectId, source: "user" });
  upsertSearch(db, userId, "idea", ideaId, rawText.slice(0, 40), rawText);
  linkKeywords(db, userId, rawText, "idea", ideaId, rawText.slice(0, 24));
  return one<Row>(db, "SELECT * FROM research_ideas WHERE id = ?", ideaId)!;
}

export function listIdeas(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM research_ideas WHERE user_id = ? ORDER BY created_at DESC", userId);
}

export function updateIdea(db: Sql, userId: string, ideaId: string, related: unknown): void {
  run(db, "UPDATE research_ideas SET related_json = ? WHERE id = ? AND user_id = ?", JSON.stringify(related), ideaId, userId);
}

export function createProject(db: Sql, userId: string, input: Record<string, unknown>): Row {
  const projectId = id();
  const at = stamp();
  const title = String(input.title);
  run(db, "INSERT INTO research_projects (id, user_id, title, topic, status, stage, progress, next_step, gaps, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', '0', 0, ?, ?, ?, ?)", projectId, userId, title, input.topic ?? null, input.nextStep ?? null, input.gaps ?? null, at, at);
  for (const [key, name] of THESIS_STAGES) {
    run(db, "INSERT INTO thesis_sections (id, user_id, project_id, stage_key, title, updated_at) VALUES (?, ?, ?, ?, ?, ?)", id(), userId, projectId, key, name, at);
  }
  if (input.question) addQuestion(db, userId, projectId, String(input.question), "建立研究時的第一版");
  upsertSearch(db, userId, "project", projectId, title, String(input.topic ?? ""));
  touchNode(db, userId, "question", title, "project", projectId);
  return one<Row>(db, "SELECT * FROM research_projects WHERE id = ?", projectId)!;
}

export function listProjects(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM research_projects WHERE user_id = ? ORDER BY updated_at DESC", userId);
}

export function getProject(db: Sql, userId: string, projectId: string): Row | null {
  const project = one<Row>(db, "SELECT * FROM research_projects WHERE id = ? AND user_id = ?", projectId, userId);
  if (!project) return null;
  return {
    ...project,
    questions: rows<Row>(db, "SELECT * FROM research_questions WHERE project_id = ? AND user_id = ? ORDER BY version", projectId, userId),
    papers: rows<Row>(db, "SELECT * FROM papers WHERE project_id = ? AND user_id = ? ORDER BY updated_at DESC", projectId, userId),
    thesis: rows<Row>(db, "SELECT * FROM thesis_sections WHERE project_id = ? AND user_id = ? ORDER BY CAST(stage_key AS INTEGER)", projectId, userId),
    tasks: rows<Row>(db, "SELECT * FROM tasks WHERE project_id = ? AND user_id = ? AND status = 'open' ORDER BY due_at", projectId, userId),
    ideas: rows<Row>(db, "SELECT * FROM research_ideas WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC", projectId, userId),
  };
}

export function updateProject(db: Sql, userId: string, projectId: string, patch: Record<string, unknown>): Row | null {
  const current = one<Row>(db, "SELECT * FROM research_projects WHERE id = ? AND user_id = ?", projectId, userId);
  if (!current) return null;
  run(db, "UPDATE research_projects SET title=?, topic=?, stage=?, progress=?, next_step=?, gaps=?, status=?, updated_at=? WHERE id=? AND user_id=?", patch.title ?? current.title, patch.topic ?? current.topic, patch.stage ?? current.stage, patch.progress ?? current.progress, patch.nextStep ?? patch.next_step ?? current.next_step, patch.gaps ?? current.gaps, patch.status ?? current.status, stamp(), projectId, userId);
  return getProject(db, userId, projectId);
}

export function addQuestion(db: Sql, userId: string, projectId: string, body: string, note?: string): Row {
  const owned = one<Row>(db, "SELECT id FROM research_projects WHERE id = ? AND user_id = ?", projectId, userId);
  if (!owned) throw new Error("找不到研究計畫");
  const last = one<Row>(db, "SELECT MAX(version) AS v FROM research_questions WHERE project_id = ?", projectId);
  const version = Number(last?.v ?? 0) + 1;
  const qid = id();
  run(db, "INSERT INTO research_questions (id, user_id, project_id, version, body, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", qid, userId, projectId, version, body, note ?? null, stamp());
  addRevision(db, userId, "research_question", projectId, { version, body, note });
  upsertSearch(db, userId, "question", qid, `研究問題 V${version}`, body);
  touchNode(db, userId, "question", `研究問題 V${version}`, "question", qid);
  return one<Row>(db, "SELECT * FROM research_questions WHERE id = ?", qid)!;
}

export function updateThesis(db: Sql, userId: string, projectId: string, stageKey: string, patch: Record<string, unknown>): Row | null {
  const current = one<Row>(db, "SELECT * FROM thesis_sections WHERE project_id = ? AND stage_key = ? AND user_id = ?", projectId, stageKey, userId);
  if (!current) return null;
  const body = String(patch.body ?? current.body ?? "");
  if (body !== String(current.body ?? "")) addRevision(db, userId, "thesis_section", String(current.id), { stageKey, body, progress: patch.progress ?? current.progress });
  run(db, "UPDATE thesis_sections SET body=?, progress=?, todos=?, ai_note=?, teacher_feedback=?, updated_at=? WHERE id=? AND user_id=?", body, patch.progress ?? current.progress, patch.todos ?? current.todos, patch.aiNote ?? patch.ai_note ?? current.ai_note, patch.teacherFeedback ?? patch.teacher_feedback ?? current.teacher_feedback, stamp(), current.id, userId);
  const sections = rows<Row>(db, "SELECT progress FROM thesis_sections WHERE project_id = ? AND user_id = ?", projectId, userId);
  const progress = Math.round(sections.reduce((s, row) => s + Number(row.progress ?? 0), 0) / Math.max(1, sections.length));
  run(db, "UPDATE research_projects SET progress = ?, stage = ?, updated_at = ? WHERE id = ? AND user_id = ?", progress, stageKey, stamp(), projectId, userId);
  return one<Row>(db, "SELECT * FROM thesis_sections WHERE id = ?", current.id);
}

export function insertDocument(db: Sql, userId: string, input: Record<string, unknown>): string {
  const docId = id();
  const at = stamp();
  run(db, "INSERT INTO documents (id, user_id, title, filename, mime, path, source, external_id, version_token, bytes, text_status, page_count, sensitivity, course_id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", docId, userId, String(input.title), input.filename ?? null, input.mime ?? null, input.path ?? null, input.source ?? "upload", input.externalId ?? null, input.versionToken ?? null, input.bytes ?? null, input.textStatus ?? "pending", input.pageCount ?? null, input.sensitivity ?? "normal", input.courseId ?? null, input.projectId ?? null, at, at);
  return docId;
}

export function replaceChunks(db: Sql, userId: string, documentId: string, paperId: string | null, chunks: Array<{ content: string; page: number | null }>): string[] {
  run(db, "DELETE FROM document_chunks WHERE document_id = ? AND user_id = ?", documentId, userId);
  const ids: string[] = [];
  chunks.forEach((chunk, index) => {
    const chunkId = id();
    ids.push(chunkId);
    run(db, "INSERT INTO document_chunks (id, user_id, document_id, paper_id, chunk_index, page, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", chunkId, userId, documentId, paperId, index, chunk.page, chunk.content, stamp());
  });
  run(db, "UPDATE documents SET text_status = 'ready', page_count = ?, updated_at = ? WHERE id = ? AND user_id = ?", chunks.length, stamp(), documentId, userId);
  return ids;
}

export function saveEmbedding(db: Sql, userId: string, chunkId: string, vector: number[]): void {
  run(db, "INSERT INTO embeddings (chunk_id, user_id, model, dim, vector_json, created_at) VALUES (?, ?, 'char-bigram', ?, ?, ?) ON CONFLICT(chunk_id) DO UPDATE SET vector_json=excluded.vector_json", chunkId, userId, vector.length, JSON.stringify(vector), stamp());
}

export function createPaper(db: Sql, userId: string, input: Record<string, unknown>): Row {
  const paperId = id();
  const at = stamp();
  run(db, "INSERT INTO papers (id, user_id, document_id, title, year, journal, doi, url, abstract, status, relevance, relevance_reason, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", paperId, userId, input.documentId ?? null, String(input.title || "未命名文獻"), input.year ?? null, input.journal ?? null, input.doi ?? null, input.url ?? null, input.abstract ?? null, input.status ?? "inbox", input.relevance ?? null, input.relevanceReason ?? null, input.projectId ?? null, at, at);
  const names = Array.isArray(input.authors) ? input.authors.map(String) : [];
  names.forEach((name, position) => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return;
    let author = one<Row>(db, "SELECT id FROM authors WHERE user_id = ? AND normalized = ?", userId, normalized);
    if (!author) {
      const authorId = id();
      run(db, "INSERT INTO authors (id, user_id, name, normalized) VALUES (?, ?, ?, ?)", authorId, userId, name.trim(), normalized);
      author = { id: authorId };
    }
    run(db, "INSERT OR IGNORE INTO paper_authors (paper_id, author_id, position) VALUES (?, ?, ?)", paperId, author.id, position);
    touchNode(db, userId, "scholar", name.trim());
  });
  upsertSearch(db, userId, "paper", paperId, String(input.title || "未命名文獻"), `${names.join(" ")} ${input.abstract ?? ""} ${input.doi ?? ""}`);
  linkKeywords(db, userId, `${input.title ?? ""}\n${input.abstract ?? ""}`, "paper", paperId, String(input.title || "文獻"));
  return getPaper(db, userId, paperId)!;
}

export function getPaper(db: Sql, userId: string, paperId: string): Row | null {
  const paper = one<Row>(db, "SELECT * FROM papers WHERE id = ? AND user_id = ?", paperId, userId);
  if (!paper) return null;
  const authors = rows<Row>(db, "SELECT a.name, pa.position FROM paper_authors pa JOIN authors a ON a.id = pa.author_id WHERE pa.paper_id = ? ORDER BY pa.position", paperId);
  return {
    ...paper,
    authors: authors.map((a) => a.name),
    extraction: one<Row>(db, "SELECT * FROM paper_extractions WHERE paper_id = ?", paperId),
    citation: one<Row>(db, "SELECT * FROM citations WHERE paper_id = ? AND user_id = ? ORDER BY verified DESC, created_at DESC LIMIT 1", paperId, userId),
    chunks: rows<Row>(db, "SELECT id, chunk_index, page, substr(content, 1, 500) AS content FROM document_chunks WHERE paper_id = ? AND user_id = ? ORDER BY chunk_index", paperId, userId),
  };
}

export function listPapers(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT p.*, (SELECT group_concat(a.name, '、') FROM paper_authors pa JOIN authors a ON a.id = pa.author_id WHERE pa.paper_id = p.id) AS authors FROM papers p WHERE p.user_id = ? ORDER BY p.updated_at DESC", userId);
}

export function updatePaper(db: Sql, userId: string, paperId: string, patch: Record<string, unknown>): Row | null {
  const current = one<Row>(db, "SELECT * FROM papers WHERE id = ? AND user_id = ?", paperId, userId);
  if (!current) return null;
  run(db, "UPDATE papers SET title=?, year=?, journal=?, doi=?, url=?, abstract=?, status=?, relevance=?, relevance_reason=?, project_id=?, updated_at=? WHERE id=? AND user_id=?", patch.title ?? current.title, patch.year ?? current.year, patch.journal ?? current.journal, patch.doi ?? current.doi, patch.url ?? current.url, patch.abstract ?? current.abstract, patch.status ?? current.status, patch.relevance ?? current.relevance, patch.relevanceReason ?? patch.relevance_reason ?? current.relevance_reason, patch.projectId ?? patch.project_id ?? current.project_id, stamp(), paperId, userId);
  return getPaper(db, userId, paperId);
}

export function saveExtraction(db: Sql, userId: string, paperId: string, fields: Record<string, unknown>, confidence = "unverified"): void {
  const owned = one<Row>(db, "SELECT id FROM papers WHERE id = ? AND user_id = ?", paperId, userId);
  if (!owned) throw new Error("找不到文獻");
  run(
    db,
    `INSERT INTO paper_extractions (paper_id, user_id, purpose, questions, theory, method, participants, sample_size, instruments, statistics, findings, limitations, future_work, one_liner, summary_300, full_summary, method_summary, value_note, confidence, raw_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(paper_id) DO UPDATE SET
       purpose=excluded.purpose, questions=excluded.questions, theory=excluded.theory, method=excluded.method,
       participants=excluded.participants, sample_size=excluded.sample_size, instruments=excluded.instruments,
       statistics=excluded.statistics, findings=excluded.findings, limitations=excluded.limitations,
       future_work=excluded.future_work, one_liner=excluded.one_liner, summary_300=excluded.summary_300,
       full_summary=excluded.full_summary, method_summary=excluded.method_summary, value_note=excluded.value_note,
       confidence=excluded.confidence, raw_json=excluded.raw_json, updated_at=excluded.updated_at`,
    paperId,
    userId,
    fields.purpose ?? null,
    fields.questions ?? null,
    fields.theory ?? null,
    fields.method ?? null,
    fields.participants ?? null,
    fields.sampleSize ?? fields.sample_size ?? null,
    fields.instruments ?? null,
    fields.statistics ?? null,
    fields.findings ?? null,
    fields.limitations ?? null,
    fields.futureWork ?? fields.future_work ?? null,
    fields.oneLiner ?? fields.one_liner ?? null,
    fields.summary300 ?? fields.summary_300 ?? null,
    fields.fullSummary ?? fields.full_summary ?? null,
    fields.methodSummary ?? fields.method_summary ?? null,
    fields.valueNote ?? fields.value_note ?? null,
    confidence,
    JSON.stringify(fields),
    stamp(),
  );
}

export function saveCitation(db: Sql, userId: string, paperId: string, input: Record<string, unknown>): void {
  run(db, "INSERT INTO citations (id, user_id, paper_id, doi, apa7, bibtex, ris, source, source_url, raw_json, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id(), userId, paperId, input.doi ?? null, input.apa7 ?? null, input.bibtex ?? null, input.ris ?? null, input.source ?? "manual", input.sourceUrl ?? null, input.raw ? JSON.stringify(input.raw) : null, input.verified ? 1 : 0, stamp());
}

export function listChunksForRetrieval(db: Sql, userId: string, includeSensitive: boolean): Row[] {
  const sensitivity = includeSensitive ? "" : "AND d.sensitivity = 'normal'";
  return rows<Row>(db, `SELECT c.id, c.paper_id, c.document_id, c.page, c.content, c.chunk_index, e.vector_json, d.title, d.sensitivity
    FROM document_chunks c JOIN documents d ON d.id = c.document_id
    LEFT JOIN embeddings e ON e.chunk_id = c.id
    WHERE c.user_id = ? ${sensitivity} ORDER BY c.created_at DESC LIMIT 400`, userId);
}

export function createConversation(db: Sql, userId: string, input: Record<string, unknown> = {}): string {
  const cid = id();
  const at = stamp();
  run(db, "INSERT INTO ai_conversations (id, user_id, title, mode, project_id, course_id, paper_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", cid, userId, input.title ?? "跟研究貓說話", input.mode ?? "research", input.projectId ?? null, input.courseId ?? null, input.paperId ?? null, at, at);
  return cid;
}

export function addMessage(db: Sql, userId: string, conversationId: string, role: string, content: string, extra: Record<string, unknown> = {}): void {
  const owned = one<Row>(db, "SELECT id FROM ai_conversations WHERE id = ? AND user_id = ?", conversationId, userId);
  if (!owned) throw new Error("找不到對話");
  run(db, "INSERT INTO ai_messages (id, user_id, conversation_id, role, content, sources_json, sections_json, agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id(), userId, conversationId, role, content, extra.sources ? JSON.stringify(extra.sources) : null, extra.sections ? JSON.stringify(extra.sections) : null, extra.agent ?? null, stamp());
  run(db, "UPDATE ai_conversations SET updated_at = ?, title = COALESCE(title, ?) WHERE id = ?", stamp(), content.slice(0, 24), conversationId);
  if (role === "user") upsertSearch(db, userId, "conversation", conversationId, content.slice(0, 40), content);
}

export function listMessages(db: Sql, userId: string, conversationId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM ai_messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at", conversationId, userId);
}

export function listConversations(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 40", userId);
}

export function upsertMemory(db: Sql, userId: string, layer: string, key: string, content: string, scopeType?: string, scopeId?: string): void {
  const existing = one<Row>(db, "SELECT id FROM ai_memories WHERE user_id = ? AND layer = ? AND key = ? AND ifnull(scope_id,'') = ifnull(?, '')", userId, layer, key, scopeId ?? null);
  if (existing) {
    run(db, "UPDATE ai_memories SET content = ?, updated_at = ? WHERE id = ?", content, stamp(), existing.id);
    return;
  }
  run(db, "INSERT INTO ai_memories (id, user_id, layer, scope_type, scope_id, key, content, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id(), userId, layer, scopeType ?? null, scopeId ?? null, key, content, stamp());
}

export function listMemories(db: Sql, userId: string, layer?: string): Row[] {
  if (layer) return rows<Row>(db, "SELECT * FROM ai_memories WHERE user_id = ? AND layer = ? ORDER BY updated_at DESC", userId, layer);
  return rows<Row>(db, "SELECT * FROM ai_memories WHERE user_id = ? ORDER BY updated_at DESC", userId);
}

export function createDataset(db: Sql, userId: string, input: Record<string, unknown>): string {
  const datasetId = id();
  run(db, "INSERT INTO datasets (id, user_id, title, filename, columns_json, row_count, preview_json, storage_path, project_id, sensitivity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sensitive', ?)", datasetId, userId, String(input.title), input.filename ?? null, JSON.stringify(input.columns ?? []), Number(input.rowCount ?? 0), JSON.stringify(input.preview ?? []), input.path ?? null, input.projectId ?? null, stamp());
  return datasetId;
}

export function listDatasets(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT id, title, filename, columns_json, row_count, created_at, project_id FROM datasets WHERE user_id = ? ORDER BY created_at DESC", userId);
}

export function getDataset(db: Sql, userId: string, datasetId: string): Row | null {
  return one<Row>(db, "SELECT * FROM datasets WHERE id = ? AND user_id = ?", datasetId, userId);
}

export function saveAnalysis(db: Sql, userId: string, input: Record<string, unknown>): string {
  const analysisId = id();
  run(db, "INSERT INTO analysis_runs (id, user_id, dataset_id, project_id, method, design_note, assumptions, result_json, apa, limitations, ai_interpretation, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", analysisId, userId, input.datasetId ?? null, input.projectId ?? null, String(input.method), input.designNote ?? null, input.assumptions ?? null, JSON.stringify(input.result ?? {}), input.apa ?? null, input.limitations ?? null, input.interpretation ?? null, stamp());
  return analysisId;
}

export function listAnalyses(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM analysis_runs WHERE user_id = ? ORDER BY created_at DESC", userId);
}

export function createQual(db: Sql, userId: string, title: string, projectId?: string): Row {
  const qid = id();
  run(db, "INSERT INTO qual_projects (id, user_id, title, project_id, created_at) VALUES (?, ?, ?, ?, ?)", qid, userId, title, projectId ?? null, stamp());
  return one<Row>(db, "SELECT * FROM qual_projects WHERE id = ?", qid)!;
}

export function listQual(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM qual_projects WHERE user_id = ? ORDER BY created_at DESC", userId);
}

export function addTranscript(db: Sql, userId: string, qualId: string, input: Record<string, unknown>): Row {
  const owned = one<Row>(db, "SELECT id FROM qual_projects WHERE id = ? AND user_id = ?", qualId, userId);
  if (!owned) throw new Error("找不到質性研究");
  const body = String(input.body ?? "");
  const tid = id();
  const hash = createHash("sha256").update(body).digest("hex");
  run(db, "INSERT INTO transcripts (id, user_id, qual_project_id, title, kind, body, immutable_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", tid, userId, qualId, String(input.title ?? "逐字稿"), input.kind ?? "interview", body, hash, stamp());
  return one<Row>(db, "SELECT id, title, kind, immutable_hash, created_at, length(body) AS chars FROM transcripts WHERE id = ?", tid)!;
}

export function getQual(db: Sql, userId: string, qualId: string): Row | null {
  const project = one<Row>(db, "SELECT * FROM qual_projects WHERE id = ? AND user_id = ?", qualId, userId);
  if (!project) return null;
  return {
    ...project,
    transcripts: rows<Row>(db, "SELECT id, title, kind, immutable_hash, created_at, length(body) AS chars FROM transcripts WHERE qual_project_id = ? AND user_id = ?", qualId, userId),
    codes: rows<Row>(db, "SELECT * FROM codes WHERE qual_project_id = ? AND user_id = ? ORDER BY created_at", qualId, userId),
    themes: rows<Row>(db, "SELECT * FROM themes WHERE qual_project_id = ? AND user_id = ? ORDER BY created_at", qualId, userId),
  };
}

export function getTranscriptBody(db: Sql, userId: string, transcriptId: string): Row | null {
  return one<Row>(db, "SELECT * FROM transcripts WHERE id = ? AND user_id = ?", transcriptId, userId);
}

export function addCode(db: Sql, userId: string, qualId: string, input: Record<string, unknown>): Row {
  const origin = input.origin === "ai_suggestion" ? "ai_suggestion" : "researcher";
  const codeId = id();
  run(db, "INSERT INTO codes (id, user_id, qual_project_id, transcript_id, excerpt, label, memo, origin, accepted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", codeId, userId, qualId, input.transcriptId ?? null, input.excerpt ?? null, String(input.label), input.memo ?? null, origin, origin === "researcher" ? 1 : 0, stamp());
  return one<Row>(db, "SELECT * FROM codes WHERE id = ?", codeId)!;
}

export function acceptCode(db: Sql, userId: string, codeId: string, accepted: boolean): void {
  const code = one<Row>(db, "SELECT * FROM codes WHERE id = ? AND user_id = ?", codeId, userId);
  if (!code) throw new Error("找不到編碼");
  if (code.origin === "researcher" && !accepted) throw new Error("不能刪改研究者的原始編碼；請另外新增一筆。");
  run(db, "UPDATE codes SET accepted = ? WHERE id = ? AND user_id = ?", accepted ? 1 : 0, codeId, userId);
}

export function addTheme(db: Sql, userId: string, qualId: string, input: Record<string, unknown>): Row {
  const themeId = id();
  const origin = input.origin === "ai_suggestion" ? "ai_suggestion" : "researcher";
  run(db, "INSERT INTO themes (id, user_id, qual_project_id, name, description, origin, accepted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", themeId, userId, qualId, String(input.name), input.description ?? null, origin, origin === "researcher" ? 1 : 0, stamp());
  return one<Row>(db, "SELECT * FROM themes WHERE id = ?", themeId)!;
}

export function startFocus(db: Sql, userId: string, input: Record<string, unknown>): Row {
  const fid = id();
  run(db, "INSERT INTO focus_sessions (id, user_id, title, paper_id, project_id, minutes, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)", fid, userId, String(input.title), input.paperId ?? null, input.projectId ?? null, Number(input.minutes ?? 50), stamp());
  return one<Row>(db, "SELECT * FROM focus_sessions WHERE id = ?", fid)!;
}

export function endFocus(db: Sql, userId: string, focusId: string, reflection?: string): Row | null {
  const current = one<Row>(db, "SELECT * FROM focus_sessions WHERE id = ? AND user_id = ?", focusId, userId);
  if (!current) return null;
  run(db, "UPDATE focus_sessions SET ended_at = ?, reflection = ? WHERE id = ?", stamp(), reflection ?? null, focusId);
  if (reflection?.trim()) {
    createNote(db, userId, { title: `專注後：${current.title}`, body: reflection, kind: "research", projectId: current.project_id, paperId: current.paper_id, source: "user" });
  }
  return one<Row>(db, "SELECT * FROM focus_sessions WHERE id = ?", focusId);
}

export function addFlashcards(db: Sql, userId: string, courseId: string | null, cards: Array<{ front: string; back: string }>): number {
  for (const card of cards) {
    run(db, "INSERT INTO flashcards (id, user_id, course_id, front, back, origin, created_at) VALUES (?, ?, ?, ?, ?, 'ai', ?)", id(), userId, courseId, card.front, card.back, stamp());
  }
  return cards.length;
}

export function saveOfficial(db: Sql, userId: string, item: { title: string; url: string; excerpt: string; hash: string }): { changed: boolean } {
  const prev = one<Row>(db, "SELECT content_hash FROM official_sources WHERE user_id = ? AND url = ?", userId, item.url);
  const changed = Boolean(prev && prev.content_hash !== item.hash);
  const existing = one<Row>(db, "SELECT id FROM official_sources WHERE user_id = ? AND url = ?", userId, item.url);
  if (existing) {
    run(db, "UPDATE official_sources SET title=?, excerpt=?, content_hash=?, fetched_at=?, changed=? WHERE id=?", item.title, item.excerpt, item.hash, stamp(), changed ? 1 : 0, existing.id);
  } else {
    run(db, "INSERT INTO official_sources (id, user_id, title, url, excerpt, content_hash, fetched_at, changed) VALUES (?, ?, ?, ?, ?, ?, ?, 0)", id(), userId, item.title, item.url, item.excerpt, item.hash, stamp());
  }
  return { changed };
}

export function listOfficial(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM official_sources WHERE user_id = ? ORDER BY fetched_at DESC", userId);
}

export function saveIntegration(db: Sql, userId: string, provider: string, input: Record<string, unknown>): void {
  run(
    db,
    `INSERT INTO integration_accounts (id, user_id, provider, access_token, refresh_token, expires_at, scopes, external_email, meta_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, provider) DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, scopes=excluded.scopes, external_email=excluded.external_email, meta_json=excluded.meta_json, updated_at=excluded.updated_at`,
    id(),
    userId,
    provider,
    input.accessToken ?? null,
    input.refreshToken ?? null,
    input.expiresAt ?? null,
    input.scopes ?? null,
    input.email ?? null,
    JSON.stringify(input.meta ?? {}),
    stamp(),
  );
}

export function getIntegration(db: Sql, userId: string, provider: string): Row | null {
  return one<Row>(db, "SELECT * FROM integration_accounts WHERE user_id = ? AND provider = ?", userId, provider);
}

export function upsertDriveFile(db: Sql, userId: string, file: Record<string, unknown>): void {
  run(db, `INSERT INTO drive_files (id, user_id, drive_id, name, mime, modified_time, folder, document_id, last_indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, drive_id) DO UPDATE SET name=excluded.name, mime=excluded.mime, modified_time=excluded.modified_time, folder=excluded.folder, document_id=excluded.document_id, last_indexed_at=excluded.last_indexed_at`, id(), userId, file.driveId, file.name, file.mime ?? null, file.modifiedTime ?? null, file.folder ?? null, file.documentId ?? null, file.indexedAt ?? null);
}

export function listDriveFiles(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM drive_files WHERE user_id = ? ORDER BY modified_time DESC", userId);
}

export function cacheEmail(db: Sql, userId: string, mail: Record<string, unknown>): void {
  run(db, `INSERT INTO email_cache (id, user_id, gmail_id, thread_id, from_addr, subject, snippet, category, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, gmail_id) DO UPDATE SET subject=excluded.subject, snippet=excluded.snippet, category=excluded.category`, id(), userId, mail.id, mail.threadId ?? null, mail.from ?? null, mail.subject ?? null, mail.snippet ?? null, mail.category ?? "other", mail.receivedAt ?? null);
}

export function listEmail(db: Sql, userId: string): Row[] {
  return rows<Row>(db, "SELECT * FROM email_cache WHERE user_id = ? ORDER BY received_at DESC LIMIT 40", userId);
}

export function putOauthState(db: Sql, provider: string, payload: unknown, userId?: string): string {
  const state = id();
  run(db, "INSERT INTO oauth_states (id, provider, user_id, payload_json, expires_at) VALUES (?, ?, ?, ?, ?)", state, provider, userId ?? null, JSON.stringify(payload), new Date(Date.now() + 10 * 60 * 1000).toISOString());
  return state;
}

export function takeOauthState(db: Sql, state: string): Row | null {
  const row = one<Row>(db, "SELECT * FROM oauth_states WHERE id = ?", state);
  if (!row) return null;
  run(db, "DELETE FROM oauth_states WHERE id = ?", state);
  if (String(row.expires_at) < stamp()) return null;
  return row;
}

export function todayBundle(db: Sql, userId: string, now = new Date()): Row {
  const parts = taipeiParts(now);
  const courses = listCourses(db, userId).filter((course) => Number(course.weekday) === parts.weekday);
  const tasks = listTasks(db, userId, "open");
  const papers = rows<Row>(db, "SELECT id, title, status, relevance FROM papers WHERE user_id = ? AND status != 'read' ORDER BY updated_at DESC LIMIT 6", userId);
  const notes = rows<Row>(db, "SELECT id, title, kind, updated_at, sensitivity FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 6", userId);
  const project = one<Row>(db, "SELECT * FROM research_projects WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1", userId);
  const feedback = one<Row>(db, "SELECT teacher_feedback, happened_at, title FROM meetings WHERE user_id = ? AND teacher_feedback IS NOT NULL AND teacher_feedback != '' ORDER BY happened_at DESC LIMIT 1", userId);
  const ideas = listIdeas(db, userId).slice(0, 4);
  return { courses, tasks, papers, notes, project, feedback, ideas, weekday: parts.weekday };
}

export function weeklyFacts(db: Sql, userId: string, sinceIso: string): Row {
  return {
    papers: rows<Row>(db, "SELECT id, title FROM papers WHERE user_id = ? AND created_at >= ?", userId, sinceIso),
    notes: one<Row>(db, "SELECT COUNT(*) AS n FROM notes WHERE user_id = ? AND created_at >= ?", userId, sinceIso),
    tasksDone: one<Row>(db, "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done' AND updated_at >= ?", userId, sinceIso),
    questions: rows<Row>(db, "SELECT version, body, created_at, project_id FROM research_questions WHERE user_id = ? AND created_at >= ? ORDER BY created_at", userId, sinceIso),
    meetings: rows<Row>(db, "SELECT title, teacher_feedback, happened_at FROM meetings WHERE user_id = ? AND happened_at >= ?", userId, sinceIso),
    openTasks: listTasks(db, userId, "open").slice(0, 8),
  };
}

export function agenda(db: Sql, userId: string, fromIso?: string, toIso?: string): Row[] {
  const from = fromIso ? new Date(fromIso) : new Date();
  const to = toIso ? new Date(toIso) : new Date(Date.now() + 21 * 86400000);
  const items: Row[] = listEvents(db, userId, from.toISOString(), to.toISOString()).map((event) => ({ ...event, source: event.source ?? "local" }));
  const courses = listCourses(db, userId);
  const start = taipeiParts(from);
  let cursor = Date.UTC(start.year, start.month - 1, start.day);
  const endParts = taipeiParts(to);
  const end = Date.UTC(endParts.year, endParts.month - 1, endParts.day);
  for (let guard = 0; cursor <= end && guard < 40; guard += 1) {
    const date = new Date(cursor);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    const weekday = taipeiParts(new Date(`${key}T12:00:00+08:00`)).weekday;
    for (const course of courses) {
      if (Number(course.weekday) !== weekday) continue;
      const clock = String(course.start_time || "09:00");
      items.push({ id: `course-${course.id}-${key}`, title: course.name, starts_at: new Date(`${key}T${clock.length === 5 ? clock : "09:00"}:00+08:00`).toISOString(), kind: "course", source: "course" });
    }
    cursor += 86400000;
  }
  for (const task of listTasks(db, userId, "open")) {
    if (!task.due_at) continue;
    const due = String(task.due_at);
    if (due < from.toISOString() || due >= to.toISOString()) continue;
    items.push({ id: `task-${task.id}`, title: task.title, starts_at: due, kind: "deadline", source: "task" });
  }
  return items.sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
}
