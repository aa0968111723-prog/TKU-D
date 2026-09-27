"use client";

import { useState } from "react";
import { api, useData } from "@/components/kit";

export function StatsScreen() {
  const [columns, setColumns] = useState<string[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [method, setMethod] = useState("descriptive");
  const [column, setColumn] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  return (
    <>
      <header className="topbar"><h1>統計</h1></header>
      <section className="card" style={{ display: "grid", gap: 10 }}>
        <p className="warn">資料集預設是敏感的。數字由本機計算，AI 不能另編 p 值。先看研究設計，再選方法。</p>
        <form onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const res = await fetch("/api/datasets", { method: "POST", body: form });
          const data = await res.json();
          setDatasetId(data.datasetId);
          setColumns(data.columns || []);
          setColumn(data.columns?.[0] || "");
        }}>
          <input name="file" type="file" accept=".csv,text/csv" required />
          <button className="btn-ghost">讀入 CSV</button>
        </form>
        <select className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="descriptive">描述統計</option>
          <option value="welch">Welch t</option>
          <option value="paired">配對 t</option>
          <option value="anova">單因子 ANOVA</option>
          <option value="pearson">相關</option>
          <option value="cronbach">Cronbach α</option>
          <option value="regression">迴歸</option>
        </select>
        <input className="field" placeholder="欄位，多欄用逗號" value={column} onChange={(e) => setColumn(e.target.value)} list="cols" />
        <datalist id="cols">{columns.map((name) => <option key={name} value={name} />)}</datalist>
        <button className="btn" onClick={async () => {
          const names = column.split(",").map((item) => item.trim()).filter(Boolean);
          const payload: Record<string, unknown> = { datasetId, method, column: names[0], design: "使用者指定" };
          if (method === "welch" || method === "paired" || method === "pearson") { payload.a = names[0]; payload.b = names[1]; payload.x = names[0]; payload.y = names[1]; }
          if (method === "anova" || method === "cronbach") payload.groups = names;
          if (method === "cronbach") payload.items = names;
          if (method === "regression") { payload.y = names[0]; payload.predictors = names.slice(1); }
          setResult(await api("/api/stats", { method: "POST", body: JSON.stringify(payload) }));
        }}>計算</button>
        {result && <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>}
      </section>
    </>
  );
}

export function QualScreen() {
  const { data, reload } = useData<Array<{ id: string; title: string }>>("/api/qual");
  const [title, setTitle] = useState("");
  return (
    <>
      <header className="topbar"><h1>質性研究</h1></header>
      <p className="warn">逐字稿是原始資料，系統不會改它。AI 編碼只會另存成建議，要你接受才算數。</p>
      <form className="capture" onSubmit={async (event) => { event.preventDefault(); await api("/api/qual", { method: "POST", body: JSON.stringify({ title }) }); setTitle(""); reload(); }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="新的質性研究" />
        <button className="btn">建立</button>
      </form>
      {(data ?? []).map((item) => <a className="card" key={item.id} href={`/qualitative/${item.id}`} style={{ display: "block", marginTop: 10 }}>{item.title}</a>)}
    </>
  );
}

export function QualDetail({ id }: { id: string }) {
  const { data, reload } = useData<{ transcripts: Array<{ id: string; title: string; chars: number; immutable_hash: string }>; codes: Array<{ id: string; label: string; excerpt: string | null; origin: string; accepted: number }>; themes: Array<{ name: string; origin: string }> }>(`/api/qual/${id}`);
  const [body, setBody] = useState("");
  const [label, setLabel] = useState("");
  if (!data) return <p className="muted">打開質性工作區…</p>;
  return (
    <div className="grid grid-2">
      <section className="card" style={{ display: "grid", gap: 8 }}>
        <h2>逐字稿</h2>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="貼上訪談。存進去之後不會被 AI 改寫。" />
        <button className="btn" onClick={async () => { await api(`/api/qual/${id}/transcripts`, { method: "POST", body: JSON.stringify({ title: "逐字稿", body, kind: "interview" }) }); setBody(""); reload(); }}>保存原始資料</button>
        {data.transcripts.map((item) => (
          <div key={item.id} className="row">
            <span>{item.title}　{item.chars} 字</span>
            <button className="btn-ghost" onClick={async () => { await api(`/api/qual/${id}/suggest`, { method: "POST", body: JSON.stringify({ transcriptId: item.id }) }); reload(); }}>請貓建議編碼</button>
          </div>
        ))}
      </section>
      <section className="card">
        <h2>編碼</h2>
        <form onSubmit={async (event) => { event.preventDefault(); await api(`/api/qual/${id}/codes`, { method: "POST", body: JSON.stringify({ label, origin: "researcher" }) }); setLabel(""); reload(); }}>
          <input className="field" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="我自己的編碼" />
          <button className="btn-ghost">新增研究者編碼</button>
        </form>
        {data.codes.map((code) => (
          <article className="row" key={code.id}>
            <div><span className="tag">{code.origin === "researcher" ? "研究者" : "AI 建議"}</span> {code.label}<p className="muted">{code.excerpt}</p></div>
            {code.origin === "ai_suggestion" && !code.accepted && <button className="btn" onClick={async () => { await api(`/api/codes/${code.id}/accept`, { method: "POST", body: JSON.stringify({ accepted: true }) }); reload(); }}>採用</button>}
          </article>
        ))}
      </section>
    </div>
  );
}

export function GraphScreen() {
  const { data } = useData<{ nodes: Array<{ id: string; label: string; kind: string }>; edges: Array<{ from_id: string; to_id: string }> }>("/api/graph");
  const nodes = data?.nodes ?? [];
  const edges = data?.edges ?? [];
  return (
    <>
      <header className="topbar"><h1>知識怎麼連</h1></header>
      <p className="muted">節點來自你的筆記、文獻和關鍵詞，不是你手動建的資料夾。</p>
      <svg viewBox="0 0 640 420" style={{ width: "100%", background: "white", borderRadius: 22 }}>
        {edges.map((edge, index) => {
          const from = nodes.findIndex((node) => node.id === edge.from_id);
          const to = nodes.findIndex((node) => node.id === edge.to_id);
          if (from < 0 || to < 0) return null;
          const a = place(from, nodes.length);
          const b = place(to, nodes.length);
          return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#e6ddd2" />;
        })}
        {nodes.slice(0, 40).map((node, index) => {
          const point = place(index, Math.min(nodes.length, 40));
          return <g key={node.id}><circle cx={point.x} cy={point.y} r="16" fill="#f6e7d4" /><text x={point.x} y={point.y + 28} fontSize="11" textAnchor="middle">{node.label.slice(0, 8)}</text></g>;
        })}
      </svg>
    </>
  );
}

function place(index: number, count: number) {
  const angle = (Math.PI * 2 * index) / Math.max(count, 1);
  return { x: 320 + Math.cos(angle) * 160, y: 200 + Math.sin(angle) * 120 };
}

export function WeeklyScreen() {
  const { data, reload } = useData<{ facts: { papers: unknown[]; notes: { n: number }; tasksDone: { n: number }; questions: Array<{ version: number; body: string }>; meetings: Array<{ teacher_feedback: string | null }> }; label: string }>("/api/weekly");
  if (!data) return <p className="muted">整理這一週…</p>;
  return (
    <section className="card">
      <h1 style={{ fontFamily: "var(--font-serif)" }}>這一週</h1>
      <p className="muted">{data.label}</p>
      <p>新文獻 {data.facts.papers.length}　筆記 {data.facts.notes?.n ?? 0}　完成 {data.facts.tasksDone?.n ?? 0}</p>
      {data.facts.questions.map((item) => <p key={item.version}>研究問題 V{item.version}：{item.body}</p>)}
      {data.facts.meetings.map((item, index) => <p key={index}>老師：{item.teacher_feedback}</p>)}
      <button className="btn-ghost" onClick={reload}>重新計算</button>
    </section>
  );
}

export function SourcesScreen() {
  const { data, reload } = useData<Array<{ title: string; url: string; excerpt: string; fetched_at: string; changed: number }>>("/api/official");
  const [message, setMessage] = useState("");
  return (
    <>
      <header className="topbar"><h1>所上來源</h1></header>
      <p className="muted">只保存抓到的頁面與網址，不把修業規定寫死。內容變了會標出來。</p>
      <button className="btn" onClick={async () => { const result = await api<{ changed: string[] }>("/api/official/sync", { method: "POST" }); setMessage(result.changed.length ? `有更新：${result.changed.join("、")}` : "跟上次抓到的一樣。"); reload(); }}>同步教心所與淡江首頁</button>
      {message && <p>{message}</p>}
      {(data ?? []).map((item) => <article className="card" key={item.url + item.title} style={{ marginTop: 10 }}><h2>{item.title}</h2>{item.changed ? <span className="tag">官方頁面已更新</span> : null}<p className="muted">{item.fetched_at}</p><p>{item.excerpt?.slice(0, 220)}</p><a href={item.url}>來源</a></article>)}
    </>
  );
}
