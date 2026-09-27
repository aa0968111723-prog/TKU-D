const base = process.env.APP_ORIGIN || "http://localhost:3000";

async function call(path, options = {}) {
  const res = await fetch(base + path, options);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(`${path} ${res.status} ${text.slice(0, 300)}`);
  return { body, cookie: res.headers.getSetCookie?.().join("; ") || res.headers.get("set-cookie") || "" };
}

const login = await call("/api/auth/dev", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "示範研究生", email: "demo@local" }),
});
const cookie = login.cookie.split(";")[0];
const headers = { "content-type": "application/json", cookie };

await call("/api/onboarding", { method: "POST", headers, body: JSON.stringify({ yearLevel: "碩一", semesterLabel: "114-1", researchInterest: "正念與大學生焦慮", thesisDirection: "正念對考試焦慮的影響", courseName: "研究方法" }) });
const courses = await call("/api/courses", { headers });
if (!courses.body.find((course) => course.name === "研究方法")) throw new Error("課程沒有建立");
const projects = await call("/api/projects", { headers });
const project = projects.body[0];
const paper = await call("/api/papers", {
  method: "POST",
  headers,
  body: JSON.stringify({ title: "示範不能走這條" }),
});
console.log("demo login, course, project ok", { courses: courses.body.length, project: project?.title, paperStatus: paper.body ? "unexpected" : "n/a" });
console.log("上傳 PDF 請用介面或 /api/papers/upload。這支腳本確認登入、課程與研究計畫已建立。");
