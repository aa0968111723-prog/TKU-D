"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useData } from "@/components/kit";

export function ResearchList() {
  const { data, reload } = useData<Array<{ id: string; title: string; topic: string | null; progress: number }>>("/api/projects");
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  return (
    <>
      <header className="topbar"><h1>我的研究</h1><Link className="btn-ghost" href="/research/methods">拆一個想法</Link></header>
      <form className="card" style={{ display: "grid", gap: 8, marginBottom: 14 }} onSubmit={async (event) => { event.preventDefault(); await api("/api/projects", { method: "POST", body: JSON.stringify({ title, topic }) }); setTitle(""); reload(); }}>
        <input className="field" placeholder="研究題目" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <input className="field" placeholder="現在的主題" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <button className="btn">建立</button>
      </form>
      {(data ?? []).map((project) => <Link className="card" key={project.id} href={`/research/${project.id}`} style={{ display: "block", marginBottom: 10 }}><h2>{project.title}</h2><p className="muted">{project.topic}　{project.progress}%</p></Link>)}
    </>
  );
}

export function ResearchScreen({ id }: { id: string }) {
  const { data, reload } = useData<{ id: string; title: string; topic: string | null; next_step: string | null; gaps: string | null; progress: number; questions: Array<{ version: number; body: string; created_at: string }>; papers: Array<{ id: string; title: string; relevance: string | null }>; tasks: Array<{ title: string }>; thesis: Array<{ stage_key: string; title: string; progress: number }> }>(`/api/projects/${id}`);
  const [question, setQuestion] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [evolution, setEvolution] = useState("");
  if (!data) return <p className="muted">打開研究…</p>;
  return (
    <>
      <header className="topbar"><div><p className="muted">進度 {data.progress}%</p><h1>{data.title}</h1></div><Link href="/thesis">論文階段</Link></header>
      <div className="grid grid-2">
        <section className="card">
          <h2>研究問題怎麼變</h2>
          {data.questions.map((item) => <div className="row" key={item.version}><strong>V{item.version}</strong><span>{item.body}</span></div>)}
          <button className="btn-ghost" disabled={data.questions.length < 2} onClick={async () => {
            const answer = await api<{ speech: string }>("/api/chat", { method: "POST", body: JSON.stringify({ message: `我的研究問題這些版本怎麼改變？只根據下面版本，不要補沒寫的內容。\n${data.questions.map((item) => `V${item.version}: ${item.body}`).join("\n")}`, projectId: id, mode: "research" }) });
            setEvolution(answer.speech);
          }}>這幾版怎麼變</button>
          {evolution && <p>{evolution}</p>}
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="新的一版。舊版會留下。" />
          <button className="btn" onClick={async () => { await api(`/api/projects/${id}/questions`, { method: "POST", body: JSON.stringify({ body: question }) }); setQuestion(""); reload(); }}>存成下一版</button>
        </section>
        <section className="card">
          <p>{data.topic}</p>
          <p>下一步：{data.next_step || "還沒寫"}</p>
          <input className="field" placeholder="下一步" value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
          <button className="btn-ghost" onClick={async () => { await api(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify({ nextStep }) }); reload(); }}>更新</button>
          <h3>相關文獻</h3>
          {data.papers.map((paper) => <Link className="row" key={paper.id} href={`/papers/${paper.id}`}>{paper.title}<span className="tag">{paper.relevance || "待判斷"}</span></Link>)}
          <Link href="/papers">去加入文獻</Link>
        </section>
      </div>
    </>
  );
}

export function MethodScreen() {
  const [idea, setIdea] = useState("正念對大學生焦慮的影響");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  return (
    <section className="card" style={{ display: "grid", gap: 10 }}>
      <h1 style={{ fontFamily: "var(--font-serif)" }}>把想法拆開</h1>
      <p className="muted">這不是核定過的研究設計。每一項都該有建議、理由、風險和替代。</p>
      <textarea value={idea} onChange={(e) => setIdea(e.target.value)} />
      <button className="btn" onClick={async () => { setError(""); try { setResult(await api("/api/method-lab", { method: "POST", body: JSON.stringify({ idea }) })); } catch (err) { setError(err instanceof Error ? err.message : "失敗"); } }}>拆解</button>
      {error && <p className="warn">{error}</p>}
      {result && <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result, null, 2)}</pre>}
    </section>
  );
}

export function ThesisScreen() {
  const { data } = useData<Array<{ id: string; title: string }>>("/api/projects");
  const first = data?.[0];
  const project = useData<{ thesis: Array<{ stage_key: string; title: string; body: string; progress: number; teacher_feedback: string | null }> }>(first ? `/api/projects/${first.id}` : "/api/projects");
  const [body, setBody] = useState("");
  const [stage, setStage] = useState("2");
  if (!first) return <p className="muted">先建立一個研究計畫。</p>;
  const thesis = (project.data && "thesis" in project.data ? project.data.thesis : []) as Array<{ stage_key: string; title: string; body: string; progress: number }>;
  return (
    <>
      <header className="topbar"><h1>論文進度</h1></header>
      <div className="grid">{thesis.map((section) => <article className="card" key={section.stage_key}><h2>{section.stage_key}. {section.title}</h2><p className="muted">{section.progress}%　{section.body?.slice(0, 80)}</p></article>)}</div>
      <form className="card" style={{ marginTop: 14, display: "grid", gap: 8 }} onSubmit={async (event) => { event.preventDefault(); await api(`/api/projects/${first.id}/thesis/${stage}`, { method: "PATCH", body: JSON.stringify({ body, progress: body ? 40 : 0 }) }); project.reload(); }}>
        <select className="field" value={stage} onChange={(e) => setStage(e.target.value)}>{thesis.map((section) => <option key={section.stage_key} value={section.stage_key}>{section.title}</option>)}</select>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="這一階段目前的文字。舊版會留在版本紀錄。" />
        <button className="btn">儲存這一階段</button>
      </form>
    </>
  );
}
