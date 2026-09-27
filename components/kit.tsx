"use client";

import { useEffect, useState } from "react";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "content-type": "application/json", ...(init?.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "沒有完成");
  return data as T;
}

export function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  function reload() {
    setLoading(true);
    api<T>(path).then(setData).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, [path]);
  return { data, error, loading, reload, setData };
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span className="section-label">{label}</span>
      {children}
    </label>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="muted">{children}</p>;
}
