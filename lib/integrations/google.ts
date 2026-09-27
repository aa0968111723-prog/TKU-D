const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleAuthUrl(origin: string, state: string, purpose: "login" | "connect"): string {
  const url = new URL(AUTH);
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", `${origin}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", purpose === "connect" ? "consent" : "select_account");
  url.searchParams.set("scope", [
    "openid",
    "email",
    "profile",
    ...(purpose === "connect" ? ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"] : []),
  ].join(" "));
  return url.toString();
}

export async function googleExchange(origin: string, code: string): Promise<{ accessToken: string; refreshToken?: string; expiresAt: string; email?: string; name?: string; sub?: string }> {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirect_uri: `${origin}/api/auth/google/callback`,
    grant_type: "authorization_code",
  });
  const token = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }).then((res) => res.json());
  if (!token.access_token) throw new Error(token.error_description || "Google 沒有核發 token");
  const profile = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } }).then((res) => res.json());
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
    email: profile.email,
    name: profile.name,
    sub: profile.id,
  };
}

export async function googleRefresh(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    grant_type: "refresh_token",
  });
  const token = await fetch(TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }).then((res) => res.json());
  if (!token.access_token) throw new Error("Google token 無法更新");
  return { accessToken: token.access_token, expiresAt: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString() };
}

export async function driveList(accessToken: string, folderId?: string) {
  const q = folderId ? `'${folderId}' in parents and trashed = false` : "trashed = false";
  const url = `https://www.googleapis.com/drive/v3/files?pageSize=30&fields=files(id,name,mimeType,modifiedTime,parents)&q=${encodeURIComponent(q)}`;
  const data = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then((res) => res.json());
  if (data.error) throw new Error(data.error.message || "Drive 讀取失敗");
  return (data.files ?? []) as Array<{ id: string; name: string; mimeType: string; modifiedTime: string }>;
}

export async function driveDownload(accessToken: string, fileId: string): Promise<Uint8Array> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive 下載失敗 ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function calendarList(accessToken: string) {
  const timeMin = new Date().toISOString();
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=20&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}`;
  const data = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } }).then((res) => res.json());
  if (data.error) throw new Error(data.error.message || "Calendar 讀取失敗");
  return (data.items ?? []) as Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string }; location?: string }>;
}

export async function gmailList(accessToken: string) {
  const list = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15", { headers: { Authorization: `Bearer ${accessToken}` } }).then((res) => res.json());
  if (list.error) throw new Error(list.error.message || "Gmail 讀取失敗");
  const messages = [];
  for (const item of (list.messages ?? []).slice(0, 12)) {
    const full = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${accessToken}` } }).then((res) => res.json());
    const headers = Object.fromEntries((full.payload?.headers ?? []).map((header: { name: string; value: string }) => [header.name, header.value]));
    messages.push({ id: item.id, threadId: full.threadId, from: headers.From, subject: headers.Subject, snippet: full.snippet, receivedAt: headers.Date });
  }
  return messages;
}

export function classifyMail(from = "", subject = ""): string {
  const text = `${from} ${subject}`;
  if (/tku\.edu\.tw/.test(from) && /教授|老師|teacher/i.test(text)) return "teacher";
  if (/公告|教務|行政|系統/.test(text)) return "admin";
  if (/論文|研究|研討會|期刊/.test(text)) return "research";
  return "other";
}

export async function gmailDraft(accessToken: string, input: { to: string; subject: string; body: string }): Promise<{ id: string }> {
  const raw = Buffer.from(`To: ${input.to}\r\nSubject: =?UTF-8?B?${Buffer.from(input.subject).toString("base64")}?=\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${input.body}`).toString("base64url");
  const data = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { raw } }),
  }).then((res) => res.json());
  if (data.error) throw new Error(data.error.message || "草稿建立失敗");
  return { id: data.id };
}
