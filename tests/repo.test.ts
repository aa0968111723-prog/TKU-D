import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { openDatabase } from "../lib/db";
import * as repo from "../lib/repo";

test("users cannot see each other's notes, and Chinese search finds a note", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "edupsy-"));
  const database = openDatabase(path.join(dir, "test.sqlite"));
  const a = repo.createUser(database, { name: "甲", provider: "development", subject: "a" });
  const b = repo.createUser(database, { name: "乙", provider: "development", subject: "b" });
  repo.createNote(database, String(a.id), { title: "正念筆記", body: "正念與大學生焦慮的課堂討論", kind: "research" });
  repo.createNote(database, String(b.id), { title: "別的人", body: "這不該被搜到", kind: "life" });
  const hits = repo.search(database, String(a.id), "正念");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].title, "正念筆記");
  assert.equal(repo.search(database, String(b.id), "正念").length, 0);
  const project = repo.createProject(database, String(a.id), { title: "正念研究", question: "正念與焦慮的關係是什麼？" });
  assert.equal(repo.listProjects(database, String(b.id)).length, 0);
  const again = repo.addQuestion(database, String(a.id), String(project.id), "縮小到大一新生的考試焦慮");
  assert.equal(again.version, 2);
  assert.equal(repo.listRevisions(database, String(a.id), "research_question", String(project.id)).length, 2);
});
