"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/components/kit";

export default function OtherLogin() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function dev(event: React.FormEvent) {
    event.preventDefault();
    await api("/api/auth/dev", { method: "POST", body: JSON.stringify({ name: name || "研究生", email }) });
    router.push("/onboarding");
  }

  async function mail(event: React.FormEvent) {
    event.preventDefault();
    const data = await api<{ delivered: boolean; devLink?: string }>("/api/auth/email/start", { method: "POST", body: JSON.stringify({ email }) });
    setMessage(data.delivered ? "登入信已寄出。" : data.devLink ? `開發環境連結：${data.devLink}` : "沒有寄出。請看伺服器日誌。");
  }

  return (
    <main className="sky login-wrap">
      <section className="card" style={{ width: "min(480px, 100%)", display: "grid", gap: 16 }}>
        <a href="/login">回到淡江登入</a>
        <h1 style={{ fontFamily: "var(--font-serif)", margin: 0 }}>其他方式</h1>
        <p className="muted">開發帳號只在本機或你明確打開時可用。它不會經過淡江驗證，也不會保存校務密碼。</p>
        <form onSubmit={dev} style={{ display: "grid", gap: 8 }}>
          <input className="field" placeholder="怎麼稱呼你" value={name} onChange={(event) => setName(event.target.value)} />
          <input className="field" placeholder="信箱，可空白" value={email} onChange={(event) => setEmail(event.target.value)} />
          <button className="btn" type="submit">用開發帳號進入</button>
        </form>
        <a className="btn-ghost" href="/api/auth/google">使用 Google 登入</a>
        <form onSubmit={mail} style={{ display: "grid", gap: 8 }}>
          <input className="field" placeholder="用信箱收登入連結" value={email} onChange={(event) => setEmail(event.target.value)} />
          <button className="btn-ghost" type="submit">寄登入連結</button>
        </form>
        {message && <p>{message}</p>}
      </section>
    </main>
  );
}
