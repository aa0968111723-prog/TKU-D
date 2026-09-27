"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useData } from "@/components/kit";

export function CoursesScreen() {
  const { data, reload } = useData<Array<{ id: string; name: string; instructor: string | null; schedule: string | null }>>("/api/courses");
  const [name, setName] = useState("");
  const [instructor, setInstructor] = useState("");
  const [weekday, setWeekday] = useState("2");
  const [startTime, setStartTime] = useState("14:00");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    await api("/api/courses", { method: "POST", body: JSON.stringify({ name, instructor, weekday: Number(weekday), startTime, schedule: `週${"日一二三四五六"[Number(weekday)] || ""} ${startTime}` }) });
    setName("");
    reload();
  }
  return (
    <>
      <header className="topbar"><h1>課程</h1></header>
      <form className="card" onSubmit={create} style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        <input className="field" placeholder="課程名稱，例如研究方法" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="field" placeholder="老師" value={instructor} onChange={(e) => setInstructor(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <select className="field" value={weekday} onChange={(e) => setWeekday(e.target.value)}>{[1, 2, 3, 4, 5, 6, 7].map((day) => <option key={day} value={day}>週{"日一二三四五六"[day]}</option>)}</select>
          <input className="field" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <button className="btn" type="submit">加入</button>
        </div>
      </form>
      <div className="grid">{(data ?? []).map((course) => <Link className="card" key={course.id} href={`/courses/${course.id}`}><h2>{course.name}</h2><p className="muted">{course.instructor}　{course.schedule}</p></Link>)}</div>
    </>
  );
}

export function CourseScreen({ id }: { id: string }) {
  const { data, reload } = useData<{ id: string; name: string; instructor: string | null; notes: Array<{ id: string; body: string }>; materials: Array<{ id: string; title: string; due_at: string | null }>; tasks: Array<{ id: string; title: string }>; flashcards: Array<{ front: string; back: string }> }>(`/api/courses/${id}`);
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState<Record<string, unknown> | null>(null);
  if (!data) return <p className="muted">打開課程資料…</p>;
  return (
    <>
      <header className="topbar"><div><p className="muted">{data.instructor}</p><h1>{data.name}</h1></div></header>
      <div className="grid grid-2">
        <section className="card" style={{ display: "grid", gap: 8 }}>
          <h2>課堂筆記</h2>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="老師今天說…" />
          <button className="btn" onClick={async () => { await api("/api/notes", { method: "POST", body: JSON.stringify({ body: note, title: note.slice(0, 24), kind: "course", courseId: id }) }); setNote(""); reload(); }}>存下</button>
          {data.notes.map((item) => <p key={item.id}>{item.body}</p>)}
          <button className="btn-lake" onClick={async () => setReview(await api(`/api/courses/${id}/review`, { method: "POST" }))}>整理這堂課</button>
          {review && <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(review, null, 2)}</pre>}
        </section>
        <section className="card">
          <h2>教材與作業</h2>
          <input className="field" placeholder="閱讀或作業" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="field" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          <button className="btn-ghost" onClick={async () => { await api(`/api/courses/${id}/materials`, { method: "POST", body: JSON.stringify({ title, dueAt: dueAt ? new Date(dueAt).toISOString() : null, kind: "reading" }) }); setTitle(""); reload(); }}>加入</button>
          {data.materials.map((item) => <div className="row" key={item.id}><span>{item.title}</span><span className="muted">{item.due_at?.slice(0, 10)}</span></div>)}
          <h3>複習卡</h3>
          {data.flashcards.map((card, index) => <p key={index}><strong>{card.front}</strong>　{card.back}</p>)}
        </section>
      </div>
    </>
  );
}

export function NotesScreen() {
  const { data, reload } = useData<Array<{ id: string; title: string; body: string; kind: string; sensitivity: string }>>("/api/notes");
  const [body, setBody] = useState("");
  return (
    <>
      <header className="topbar"><h1>筆記</h1></header>
      <form className="card" style={{ marginBottom: 14 }} onSubmit={async (event) => { event.preventDefault(); await api("/api/capture", { method: "POST", body: JSON.stringify({ text: body }) }); setBody(""); reload(); }}>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="不用先選資料夾" />
        <button className="btn" type="submit">存下並分類</button>
      </form>
      <div className="grid">{(data ?? []).map((note) => <Link className="card" key={note.id} href={`/notes/${note.id}`}><span className="tag">{note.kind}</span>{note.sensitivity === "sensitive" && <span className="tag">敏感</span>}<h2>{note.title}</h2><p>{note.body.slice(0, 140)}</p></Link>)}</div>
    </>
  );
}

export function NoteScreen({ id }: { id: string }) {
  const { data, reload } = useData<{ id: string; title: string; body: string; kind: string; sensitivity: string }>(`/api/notes/${id}`);
  const [body, setBody] = useState("");
  if (!data) return <p className="muted">找筆記…</p>;
  return (
    <form className="card" style={{ display: "grid", gap: 10 }} onSubmit={async (event) => { event.preventDefault(); await api(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify({ body: body || data.body }) }); reload(); }}>
      <span className="tag">{data.kind}</span>
      <h1 style={{ fontFamily: "var(--font-serif)" }}>{data.title}</h1>
      {data.sensitivity === "sensitive" && <p className="warn">敏感資料。預設不會送進一般 AI 上下文。</p>}
      <textarea defaultValue={data.body} onChange={(e) => setBody(e.target.value)} />
      <button className="btn" type="submit">更新</button>
    </form>
  );
}
