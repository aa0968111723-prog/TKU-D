"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Cat, type CatPose } from "./cat";

type Briefing = { speech: string; pose: CatPose; important: Array<{ id: string; title: string; detail: string; href: string }> };
type Settings = { disclosure?: string; cat_visible?: number; pinned_modules?: string; mode?: string };

const PRIMARY = [
  ["/today", "今天"],
  ["/ai", "研究貓"],
  ["/courses", "課程"],
  ["/research", "研究"],
  ["/notes", "筆記"],
];
const MORE = [
  ["/papers", "文獻"],
  ["/papers/matrix", "比較矩陣"],
  ["/thesis", "論文"],
  ["/graph", "知識圖"],
  ["/meetings", "討論"],
  ["/calendar", "行事曆"],
  ["/ideas", "靈感"],
  ["/stats", "統計"],
  ["/qualitative", "質性"],
  ["/weekly", "週回顧"],
  ["/sources", "所上來源"],
  ["/focus", "專注"],
  ["/more", "設定"],
];

export function Shell({
  user,
  settings,
  briefing,
  children,
}: {
  user: { name: string };
  settings: Settings;
  briefing: Briefing;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [listening, setListening] = useState(false);
  const focus = path.startsWith("/focus");
  const advanced = settings.disclosure === "full" || path !== "/today";
  const pinned = safeArray(settings.pinned_modules);

  function listen() {
    const Recognition = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
    if (!Recognition) {
      setNote("這個瀏覽器沒有語音輸入，直接打字就好。");
      setOpen(true);
      return;
    }
    const rec = new Recognition();
    rec.lang = "zh-TW";
    setListening(true);
    rec.onresult = (event) => setText(event.results[0]?.[0]?.transcript ?? "");
    rec.onend = () => setListening(false);
    rec.start();
    setOpen(true);
  }

  async function capture(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    const res = await fetch("/api/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    const data = await res.json();
    setNote(data.speech || data.error?.message || "記好了");
    setText("");
    router.refresh();
  }

  if (focus) return <div className="sky">{children}</div>;

  return (
    <div className="sky shell">
      <aside className="rail">
        <div className="brand">
          <Cat pose={briefing.pose} size={52} />
          <div>
            <strong>研究貓</strong>
            <span>教心所研究室</span>
          </div>
        </div>
        <nav className="nav-group">
          <div className="nav-label">每天</div>
          {PRIMARY.map(([href, label]) => (
            <Link key={href} className="nav-link" data-active={path.startsWith(href)} href={href}>{label}</Link>
          ))}
          {(advanced || pinned.length > 0) && <div className="nav-label">需要時再開</div>}
          {MORE.filter(([href]) => settings.disclosure === "full" || pinned.includes(href) || path.startsWith(href)).map(([href, label]) => (
            <Link key={href} className="nav-link" data-active={path === href} href={href}>{label}</Link>
          ))}
          <Link className="nav-link" href="/more">全部功能</Link>
        </nav>
        <div className="muted" style={{ marginTop: "auto", fontSize: 13, padding: "0 8px" }}>{user.name}</div>
      </aside>
      <div className="main">{children}</div>
      {settings.cat_visible !== 0 && (
        <div className="cat-dock">
          {open && (
            <div className="cat-panel">
              <p style={{ marginTop: 0 }}>{briefing.speech}</p>
              <form className="capture" onSubmit={capture}>
                <input value={text} onChange={(event) => setText(event.target.value)} placeholder={listening ? "在聽…" : "想到什麼了？"} />
                <button className="btn-ghost" type="button" onClick={listen}>{listening ? "聽" : "說"}</button>
                <button className="btn" type="submit">放下</button>
              </form>
              {note && <p className="muted">{note}</p>}
              <Link href="/ai">打開完整對話</Link>
            </div>
          )}
          <button aria-label="打開研究貓" onClick={() => setOpen((value) => !value)} style={{ border: 0, background: "transparent" }}>
            <Cat pose={open ? "thinking" : briefing.pose} size={92} />
          </button>
        </div>
      )}
      <nav className="mobile-nav">
        <Link href="/today">今天</Link>
        <Link href="/research">研究</Link>
        <button className="plus" onClick={() => setOpen(true)}>＋</button>
        <Link href="/notes">筆記</Link>
        <Link href="/ai">貓</Link>
      </nav>
    </div>
  );
}

function safeArray(value?: string) {
  try { return JSON.parse(value || "[]") as string[]; } catch { return []; }
}

type SpeechRec = {
  lang: string;
  start: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
};
