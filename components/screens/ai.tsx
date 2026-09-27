"use client";

import { useState } from "react";
import { Cat } from "@/components/cat";
import { api, useData } from "@/components/kit";

const MODES = [
  ["research", "一起研究"],
  ["study", "一起讀書"],
  ["writing", "一起寫"],
  ["focus", "陪我專心"],
  ["meeting", "記錄討論"],
  ["capture", "突然想到"],
];

export function AiScreen() {
  const [mode, setMode] = useState("research");
  const [text, setText] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [turns, setTurns] = useState<Array<{ role: string; content: string; sections?: Record<string, string> | null; followups?: string[] }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ask(event: React.FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    setTurns((items) => [...items, { role: "user", content: message }]);
    setText("");
    setBusy(true);
    setError("");
    try {
      const data = await api<{ conversationId: string; speech: string; sections: Record<string, string> | null; followups?: string[] }>("/api/chat", { method: "POST", body: JSON.stringify({ message, conversationId, mode }) });
      setConversationId(data.conversationId);
      setTurns((items) => [...items, { role: "assistant", content: data.speech, sections: data.sections, followups: data.followups }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "研究貓暫時沒連上");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid grid-2">
      <section>
        <header className="topbar"><h1>研究貓</h1></header>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {MODES.map(([key, label]) => <button key={key} className={mode === key ? "btn" : "btn-ghost"} onClick={() => setMode(key)}>{label}</button>)}
        </div>
        <div className="card" style={{ minHeight: 280 }}>
          {turns.length === 0 && <p className="muted">可以直接問：我今天該做什麼？這篇 paper 跟我的研究有什麼關係？我的研究問題這陣子怎麼變？</p>}
          {turns.map((turn, index) => (
            <article key={index} style={{ marginBottom: 14 }}>
              <strong>{turn.role === "user" ? "你" : "研究貓"}</strong>
              <p>{turn.content}</p>
              {turn.sections && (
                <div className="grid">
                  <p><span className="tag moss">原始資料</span> {turn.sections.source}</p>
                  <p><span className="tag lake">AI 整理</span> {turn.sections.organized}</p>
                  <p><span className="tag">AI 推論</span> {turn.sections.inference}</p>
                  <p><span className="tag">待確認</span> {turn.sections.unverified}</p>
                </div>
              )}
              {turn.followups?.map((item) => <button key={item} className="btn-ghost" style={{ marginRight: 6 }} onClick={() => setText(item)}>{item}</button>)}
            </article>
          ))}
          {busy && <Cat pose="loading" size={72} />}
          {error && <p className="warn">{error}。本機請先執行 npm run ai-proxy，讓 Hermes 掛上 xAI Grok OAuth。</p>}
        </div>
        <form className="capture" onSubmit={ask} style={{ marginTop: 12 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="問研究，不是叫它代寫" />
          <button className="btn" disabled={busy}>送出</button>
        </form>
      </section>
      <Conversations onOpen={async (id) => {
        const messages = await api<Array<{ role: string; content: string; sections_json: string | null }>>(`/api/conversations/${id}`);
        setConversationId(id);
        setTurns(messages.map((message) => ({ role: message.role, content: message.content, sections: message.sections_json ? JSON.parse(message.sections_json) : null })));
      }} />
    </div>
  );
}

function Conversations({ onOpen }: { onOpen: (id: string) => void }) {
  const { data } = useData<Array<{ id: string; title: string }>>("/api/conversations");
  return (
    <aside className="card">
      <h2>以前問過</h2>
      {(data ?? []).map((item) => <button key={item.id} className="row" onClick={() => onOpen(item.id)} style={{ width: "100%", background: "transparent", border: 0, textAlign: "left" }}>{item.title}</button>)}
    </aside>
  );
}

export function FocusScreen() {
  const [title, setTitle] = useState("閱讀一篇文獻");
  const [minutes, setMinutes] = useState(25);
  const [left, setLeft] = useState(0);
  const [id, setId] = useState("");
  const [reflection, setReflection] = useState("");
  const [done, setDone] = useState("");
  async function start() {
    const session = await api<{ id: string }>("/api/focus", { method: "POST", body: JSON.stringify({ title, minutes }) });
    setId(session.id);
    setLeft(minutes * 60);
    const timer = window.setInterval(() => {
      setLeft((value) => {
        if (value <= 1) { window.clearInterval(timer); return 0; }
        return value - 1;
      });
    }, 1000);
  }
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section className="card" style={{ width: "min(520px, 100%)", textAlign: "center" }}>
        <Cat pose="focus" size={120} />
        <p className="muted">專注的時候，不推其他事情。</p>
        <h1 style={{ fontFamily: "var(--font-serif)" }}>{title}</h1>
        <p style={{ fontSize: 42 }}>{left ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : `${minutes}:00`}</p>
        {!id && <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />}
        {!id && <button className="btn" onClick={start}>開始 {minutes} 分鐘</button>}
        {id && left === 0 && (
          <form onSubmit={async (event) => { event.preventDefault(); await api(`/api/focus/${id}/end`, { method: "POST", body: JSON.stringify({ reflection }) }); setDone("記好了，放進研究筆記。"); }}>
            <textarea value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="剛剛有沒有值得留下的一句話？" />
            <button className="btn">留下</button>
          </form>
        )}
        {done && <p>{done}</p>}
        <a href="/today">離開專注</a>
      </section>
    </main>
  );
}
