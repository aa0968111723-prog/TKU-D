"use client";

import { useState } from "react";
import { api, useData } from "@/components/kit";

export function MeetingsScreen() {
  const { data, reload } = useData<Array<{ id: string; title: string; happened_at: string; teacher_feedback: string | null; body: string }>>("/api/meetings");
  const [body, setBody] = useState("");
  const [feedback, setFeedback] = useState("");
  return (
    <>
      <header className="topbar"><h1>討論</h1></header>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={async (event) => { event.preventDefault(); await api("/api/capture", { method: "POST", body: JSON.stringify({ text: `老師說${feedback || body}` }) }); await api("/api/meetings", { method: "POST", body: JSON.stringify({ title: "指導討論", body, teacherFeedback: feedback }) }); setBody(""); setFeedback(""); reload(); }}>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="討論了什麼" />
        <input className="field" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="老師建議，會出現在首頁" />
        <button className="btn">存下，並抽出待辦</button>
      </form>
      {(data ?? []).map((item) => <article className="card" key={item.id} style={{ marginTop: 10 }}><h2>{item.title}</h2><p>{item.body}</p>{item.teacher_feedback && <p className="warn">{item.teacher_feedback}</p>}</article>)}
    </>
  );
}

export function IdeasScreen() {
  const { data, reload } = useData<Array<{ id: string; raw_text: string; keywords: string; related_json: string }>>("/api/ideas");
  const [text, setText] = useState("");
  return (
    <>
      <header className="topbar"><h1>靈感箱</h1></header>
      <form className="capture" onSubmit={async (event) => { event.preventDefault(); await api("/api/ideas", { method: "POST", body: JSON.stringify({ text }) }); setText(""); reload(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="禪修 × 自我效能 × 大學生？" />
        <button className="btn">留下</button>
      </form>
      {(data ?? []).map((idea) => (
        <article className="card" key={idea.id} style={{ marginTop: 10 }}>
          <p>{idea.raw_text}</p>
          <p className="muted">{idea.keywords}</p>
          <button className="btn-ghost" onClick={async () => { await api(`/api/ideas/${idea.id}/recommend`, { method: "POST" }); reload(); }}>找公開文獻，不刪原文</button>
          <pre style={{ whiteSpace: "pre-wrap" }}>{idea.related_json}</pre>
        </article>
      ))}
    </>
  );
}

export function CalendarScreen() {
  const from = new Date();
  const to = new Date(Date.now() + 21 * 86400000).toISOString();
  const { data, reload } = useData<{ items: Array<{ id: string; title: string; starts_at: string; kind: string }>; openDays: string[] }>(`/api/events?from=${from.toISOString()}&to=${to}`);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  return (
    <>
      <header className="topbar"><h1>接下來三週</h1></header>
      <p className="muted">課表和截止會自己出現。比較空的日子：{(data?.openDays ?? []).slice(0, 5).join("、") || "這段都有事，但不代表你該加碼。"}</p>
      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={async (event) => { event.preventDefault(); await api("/api/events", { method: "POST", body: JSON.stringify({ title, startsAt: new Date(startsAt).toISOString(), kind: "personal" }) }); reload(); }}>
        <input className="field" placeholder="一件行程" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="field" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <button className="btn">加上</button>
      </form>
      {(data?.items ?? []).map((event) => <div className="row" key={event.id}><span>{event.title}</span><span className="muted">{event.starts_at.slice(0, 16).replace("T", " ")}　{event.kind}</span></div>)}
    </>
  );
}

export function SearchScreen() {
  const [q, setQ] = useState("正念");
  const [hits, setHits] = useState<Array<{ entity_type: string; entity_id: string; title: string; snippet: string }>>([]);
  return (
    <>
      <header className="topbar"><h1>找找看</h1></header>
      <form className="capture" onSubmit={async (event) => { event.preventDefault(); setHits(await api(`/api/search?q=${encodeURIComponent(q)}`)); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn">搜尋</button>
      </form>
      {hits.map((hit) => <article className="card" key={hit.entity_type + hit.entity_id} style={{ marginTop: 10 }}><span className="tag">{hit.entity_type}</span><h2>{hit.title}</h2><p className="muted">{hit.snippet}</p></article>)}
    </>
  );
}

export function MoreScreen() {
  const { data, reload } = useData<{ disclosure: string; socratic: number; cat_visible: number; ai_include_sensitive: number; mode: string }>("/api/settings");
  const integrations = useData<{ google: boolean; configured: { google: boolean; tku: boolean } }>("/api/integrations");
  const memories = useData<Array<{ id: string; layer: string; content: string }>>("/api/memories");
  const [raw, setRaw] = useState("");
  const [mail, setMail] = useState({ to: "", subject: "", body: "" });
  if (!data) return <p className="muted">打開設定…</p>;
  async function patch(partial: Record<string, unknown>) {
    await api("/api/settings", { method: "PATCH", body: JSON.stringify(partial) });
    reload();
  }
  return (
    <>
      <header className="topbar"><h1>研究室設定</h1></header>
      <section className="card" style={{ display: "grid", gap: 8 }}>
        <button className="btn-ghost" onClick={() => patch({ disclosure: data.disclosure === "full" ? "starter" : "full" })}>{data.disclosure === "full" ? "收回進階功能" : "打開全部功能"}</button>
        <button className="btn-ghost" onClick={() => patch({ socratic: data.socratic ? 0 : 1 })}>蘇格拉底模式：{data.socratic ? "開" : "關"}</button>
        <button className="btn-ghost" onClick={() => patch({ cat_visible: data.cat_visible ? 0 : 1 })}>研究貓：{data.cat_visible ? "顯示" : "隱藏"}</button>
        <button className="btn-ghost" onClick={() => patch({ ai_include_sensitive: data.ai_include_sensitive ? 0 : 1 })}>敏感資料進 AI：{data.ai_include_sensitive ? "允許" : "預設不送"}</button>
        <a className="btn-ghost" href="/api/auth/google?purpose=connect">連接 Google Drive／Calendar／Gmail</a>
        <button className="btn-ghost" onClick={async () => alert(JSON.stringify(await api("/api/integrations/drive/sync", { method: "POST" })))}>同步 Drive 新檔</button>
        <button className="btn-ghost" onClick={async () => alert(JSON.stringify(await api("/api/integrations/calendar/sync", { method: "POST" })))}>同步行事曆</button>
        <button className="btn-ghost" onClick={async () => alert(JSON.stringify(await api("/api/integrations/gmail/sync", { method: "POST" })))}>整理信件</button>
        <p className="muted">Google：{integrations.data?.google ? "已連接" : "未連接"}。淡江 SSO：{integrations.data?.configured.tku ? "已設定 client" : "尚未取得學校授權"}。</p>
        <h3>記得的事</h3>
        {(memories.data ?? []).length === 0 && <p className="muted">研究貓還沒留下長期記憶。對話裡反覆出現的主題，會記在這裡，不會把整段聊天塞進提示。</p>}
        {(memories.data ?? []).slice(0, 8).map((item) => <p key={item.id}><span className="tag">{item.layer}</span> {item.content}</p>)}
      </section>
      <section className="card" style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <h2>匯入 RIS / BibTeX</h2>
        <textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="@article 或 TY  - JOUR" />
        <button className="btn" onClick={async () => alert(JSON.stringify(await api("/api/papers/import", { method: "POST", body: JSON.stringify({ format: raw.includes("@") ? "bibtex" : "ris", raw }) })))}>匯入</button>
      </section>
      <section className="card" style={{ marginTop: 12, display: "grid", gap: 8 }}>
        <h2>信的草稿</h2>
        <p className="muted">只建立 Gmail 草稿，不會自己寄出。</p>
        <input className="field" placeholder="給誰" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value })} />
        <input className="field" placeholder="主旨" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
        <textarea value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} />
        <button className="btn" onClick={async () => alert(JSON.stringify(await api("/api/integrations/gmail/draft", { method: "POST", body: JSON.stringify({ ...mail, confirm: "建立草稿" }) })))}>確認建立草稿</button>
      </section>
      <form className="card" style={{ marginTop: 12 }} onSubmit={async (event) => { event.preventDefault(); await api("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>
        <button className="btn-ghost" type="submit">登出</button>
      </form>
    </>
  );
}
