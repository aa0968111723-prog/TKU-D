"use client";

import Link from "next/link";
import { useState } from "react";
import { Cat } from "@/components/cat";
import { api, useData } from "@/components/kit";

type Today = {
  user: { name: string };
  briefing: { greeting: string; dateLabel: string; speech: string; pose: "idle"; important: Array<{ id: string; title: string; detail: string; href: string }>; parked: number; openTasks: number };
  courses: Array<{ id: string; name: string; start_time: string | null; instructor: string | null }>;
  tasks: Array<{ id: string; title: string; due_at: string | null; priority: number }>;
  papers: Array<{ id: string; title: string; status: string }>;
  notes: Array<{ id: string; title: string; kind: string }>;
  project: { id: string; title: string; progress: number; next_step: string | null } | null;
  feedback: { teacher_feedback: string; title: string } | null;
};

export function TodayScreen() {
  const { data, reload } = useData<Today>("/api/today");
  const [text, setText] = useState("");
  const [speech, setSpeech] = useState("");
  if (!data) return <p className="muted">研究室正在鋪開桌面…</p>;
  async function capture(event: React.FormEvent) {
    event.preventDefault();
    const result = await api<{ speech: string; plan?: { privacyWarning?: string } }>("/api/capture", { method: "POST", body: JSON.stringify({ text }) });
    setSpeech(result.plan?.privacyWarning || result.speech);
    setText("");
    reload();
  }
  return (
    <>
      <header className="topbar">
        <div>
          <p className="muted">{data.briefing.dateLabel}</p>
          <h1>{data.briefing.greeting}，{data.user.name}</h1>
        </div>
        <Cat pose={data.briefing.pose} size={96} />
      </header>
      <form className="capture" onSubmit={capture} style={{ marginBottom: 16 }}>
        <input value={text} onChange={(event) => setText(event.target.value)} placeholder="想到什麼就丟進來" />
        <button className="btn" type="submit">放下</button>
      </form>
      {speech && <p className="warn">{speech}</p>}
      <div className="grid grid-3">
        <section className="card">
          <h2>今天真正要看的</h2>
          <p>{data.briefing.speech}</p>
          {data.briefing.important.map((item) => (
            <Link className="row" key={item.id} href={item.href}>
              <strong>{item.title}</strong>
              <span className="muted">{item.detail}</span>
            </Link>
          ))}
          <p className="muted">另外 {data.briefing.parked} 件已收好，沒有拿來催你。</p>
        </section>
        <section className="card">
          <h2>今天的課</h2>
          {data.courses.length === 0 && <p className="muted">今天沒有排課。</p>}
          {data.courses.map((course) => <Link className="row" key={course.id} href={`/courses/${course.id}`}><span>{course.name}</span><span>{course.start_time}</span></Link>)}
          <h3 style={{ marginTop: 18 }}>待辦</h3>
          {data.tasks.slice(0, 5).map((task) => (
            <div className="row" key={task.id}>
              <span>{task.title}</span>
              <button className="btn-ghost" onClick={async () => { await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: "done" }) }); reload(); }}>完成</button>
            </div>
          ))}
        </section>
        <section className="card">
          <h2>研究</h2>
          {data.project ? <Link href={`/research/${data.project.id}`}><strong>{data.project.title}</strong><p>進度 {data.project.progress}%　{data.project.next_step}</p></Link> : <p className="muted">還沒有研究計畫。</p>}
          {data.feedback && <p className="warn">上次老師：{data.feedback.teacher_feedback}</p>}
          <h3>待讀</h3>
          {data.papers.map((paper) => <Link className="row" key={paper.id} href={`/papers/${paper.id}`}>{paper.title}</Link>)}
        </section>
      </div>
    </>
  );
}

export function OnboardingScreen() {
  const [form, setForm] = useState({ yearLevel: "碩一", semesterLabel: "", researchInterest: "", thesisDirection: "", advisor: "", hasAdvisor: false, courseName: "" });
  const [done, setDone] = useState("");
  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) { setForm({ ...form, [key]: value }); }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await api("/api/onboarding", { method: "POST", body: JSON.stringify({ ...form, courses: form.courseName ? [{ name: form.courseName }] : [] }) });
    setDone("研究室建好了。");
    window.location.href = "/today";
  }
  return (
    <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12, maxWidth: 640 }}>
      <h1 style={{ fontFamily: "var(--font-serif)" }}>先認識一下就好</h1>
      <p className="muted">只問現在需要的。課程和研究之後都可以改。</p>
      <input className="field" placeholder="年級，例如碩一" value={form.yearLevel} onChange={(e) => set("yearLevel", e.target.value)} />
      <input className="field" placeholder="現在學期，例如 114-1" value={form.semesterLabel} onChange={(e) => set("semesterLabel", e.target.value)} />
      <input className="field" placeholder="一門正在修的課" value={form.courseName} onChange={(e) => set("courseName", e.target.value)} />
      <input className="field" placeholder="研究興趣" value={form.researchInterest} onChange={(e) => set("researchInterest", e.target.value)} />
      <input className="field" placeholder="如果已有論文方向" value={form.thesisDirection} onChange={(e) => set("thesisDirection", e.target.value)} />
      <input className="field" placeholder="指導教授，沒有可空白" value={form.advisor} onChange={(e) => set("advisor", e.target.value)} />
      <label><input type="checkbox" checked={form.hasAdvisor} onChange={(e) => set("hasAdvisor", e.target.checked)} /> 已經有指導教授</label>
      <button className="btn" type="submit">建立研究室</button>
      {done && <p>{done}</p>}
    </form>
  );
}
