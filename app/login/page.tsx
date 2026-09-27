"use client";

import { useState } from "react";
import { Cat } from "@/components/cat";

export default function LoginPage() {
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  async function sso() {
    setChecking(true);
    const res = await fetch("/api/auth/providers");
    const data = await res.json();
    if (!data.configured) {
      setMessage(data.note || "淡江尚未核發第三方登入。可以先用其他方式進來，之後不用重寫登入。");
      setChecking(false);
      return;
    }
    window.location.href = "/api/auth/tku";
  }

  return (
    <main className="sky login-wrap">
      <section className="login-card card">
        <div className="desk"><Cat pose="reading" size={150} /></div>
        <p className="muted" style={{ letterSpacing: "0.14em", fontSize: 12 }}>TKU EDUPSY</p>
        <h1>歡迎回來</h1>
        <p>今天一起把研究慢慢整理好。</p>
        <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
          <button className="btn-lake" onClick={sso} disabled={checking}>{checking ? "確認學校登入…" : "使用淡江 SSO 登入"}</button>
          <a className="btn-ghost" href="/login/other">其他登入方式</a>
        </div>
        {message && <p className="warn" style={{ textAlign: "left", marginTop: 16 }}>{message}</p>}
      </section>
    </main>
  );
}
