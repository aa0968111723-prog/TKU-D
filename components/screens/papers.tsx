"use client";

import Link from "next/link";
import { useState } from "react";
import { api, useData } from "@/components/kit";

type Paper = { id: string; title: string; year: number | null; authors: string | null; relevance: string | null; relevance_reason: string | null; status: string; doi: string | null };

export function PapersScreen() {
  const { data, reload } = useData<Paper[]>("/api/papers");
  const [message, setMessage] = useState("");
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("正在讀文獻…");
    const res = await fetch("/api/papers/upload", { method: "POST", body: form });
    const body = await res.json();
    if (!res.ok) setMessage(body.error?.message || "上傳失敗");
    else setMessage(body.scholarly ? "已對到公開書目。" : "沒有對到 DOI。引用處會寫未找到可靠來源，不會自己編。");
    reload();
  }
  return (
    <>
      <header className="topbar"><h1>文獻</h1><Link href="/papers/matrix">比較</Link></header>
      <form className="card" onSubmit={upload} style={{ marginBottom: 14 }}>
        <input name="file" type="file" required />
        <button className="btn" type="submit">上傳並閱讀</button>
        <p className="muted">PDF、Word、簡報、文字、圖片都可以。圖片會請研究貓轉錄看得到的字。</p>
        {message && <p>{message}</p>}
      </form>
      {(data ?? []).map((paper) => (
        <Link className="card" key={paper.id} href={`/papers/${paper.id}`} style={{ display: "block", marginBottom: 10 }}>
          <span className="tag">{paper.relevance || "待判斷"}</span>
          <h2>{paper.title}</h2>
          <p className="muted">{paper.authors} {paper.year || ""}</p>
        </Link>
      ))}
    </>
  );
}

export function PaperScreen({ id }: { id: string }) {
  const { data, reload } = useData<{ id: string; title: string; doi: string | null; abstract: string | null; authors: string[]; relevance: string | null; relevance_reason: string | null; extraction: Record<string, string> | null; citation: { apa7: string | null; source: string; verified: number } | null; chunks: Array<{ page: number | null; content: string }> }>(`/api/papers/${id}`);
  const { data: projects } = useData<Array<{ id: string; title: string }>>("/api/projects");
  const [projectId, setProjectId] = useState("");
  if (!data) return <p className="muted">打開文獻…</p>;
  const extraction = data.extraction;
  return (
    <>
      <header className="topbar"><div><p className="muted">{data.authors?.join("、")} {data.doi || "沒有 DOI"}</p><h1>{data.title}</h1></div></header>
      <div className="grid grid-2">
        <section className="card">
          <h2>跟我的研究</h2>
          <p>{data.relevance_reason || "還沒判斷。"}</p>
          <span className="tag lake">{data.relevance || "待判斷"}</span>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <select className="field" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">加到研究</option>
              {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
            <button className="btn" onClick={async () => { if (projectId) { await api(`/api/papers/${id}`, { method: "PATCH", body: JSON.stringify({ projectId }) }); reload(); } }}>加入</button>
          </div>
          <h3>引用</h3>
          {data.citation?.verified ? <p>{data.citation.apa7}</p> : <p className="warn">未找到可靠來源。不會幫你編一筆 reference。</p>}
          <p className="muted">來源：{data.citation?.source || "none"}</p>
        </section>
        <section className="card">
          <h2>整理</h2>
          {extraction ? (
            <>
              <p><span className="tag">一句話</span> {extraction.one_liner}</p>
              <p><span className="tag moss">AI 整理</span> {extraction.summary_300}</p>
              <p>方法：{extraction.method || "待確認"}</p>
              <p>發現：{extraction.findings || "待確認"}</p>
              <p>限制：{extraction.limitations || "待確認"}</p>
            </>
          ) : <p className="muted">還沒有抽取。上傳時若 AI 沒連上，可以再讀一次。</p>}
          <button className="btn-ghost" onClick={async () => { await api(`/api/papers/${id}/read`, { method: "POST" }); reload(); }}>再讀一次</button>
          <h3>原文片段</h3>
          {data.chunks.slice(0, 3).map((chunk, index) => <p key={index} className="muted">p.{chunk.page ?? "?"} {chunk.content.slice(0, 180)}</p>)}
        </section>
      </div>
    </>
  );
}

export function MatrixScreen() {
  const { data } = useData<Paper[]>("/api/papers");
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ rows: Array<Record<string, unknown>>; synthesis: Record<string, unknown> | null; label: string } | null>(null);
  return (
    <>
      <header className="topbar"><h1>文獻比較</h1></header>
      {(data ?? []).map((paper) => (
        <label className="row" key={paper.id}><input type="checkbox" checked={picked.includes(paper.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, paper.id] : picked.filter((id) => id !== paper.id))} />{paper.title}</label>
      ))}
      <button className="btn" disabled={picked.length < 2} onClick={async () => setResult(await api("/api/papers/matrix", { method: "POST", body: JSON.stringify({ ids: picked }) }))}>產生矩陣</button>
      {result && (
        <div className="card" style={{ overflowX: "auto", marginTop: 12 }}>
          <p className="muted">{result.label}</p>
          <table>
            <tbody>
              {result.rows.map((row) => (
                <tr key={String(row.id)}>
                  {Object.entries(row).filter(([key]) => key !== "id").map(([key, value]) => <td key={key} style={{ borderTop: "1px solid var(--color-line)", padding: 8, verticalAlign: "top" }}><small className="muted">{key}</small><br />{String(value)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {result.synthesis && <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result.synthesis, null, 2)}</pre>}
        </div>
      )}
    </>
  );
}
