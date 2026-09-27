import { createHash, randomBytes } from "node:crypto";
import { id } from "../ids";

const SSO_NOTE = "淡江公開的 sso.tku.edu.tw 目前是 IBM WebSEAL 登入頁，沒有對第三方公開 OIDC discovery。沒有學校核發的 client 時，不能假裝登入成功，也不能代收校務密碼。";

export function tkuStatus() {
  const issuer = process.env.TKU_OIDC_ISSUER || "";
  const clientId = process.env.TKU_OIDC_CLIENT_ID || "";
  return {
    configured: Boolean(issuer && clientId && process.env.TKU_OIDC_CLIENT_SECRET),
    issuer: issuer || null,
    note: SSO_NOTE,
    loginUrl: "https://sso.tku.edu.tw/NEAI/loginrwd.jsp",
  };
}

export async function probeTku(): Promise<{ ok: boolean; kind: string; detail: string }> {
  const issuer = process.env.TKU_OIDC_ISSUER;
  const url = issuer ? `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration` : "https://sso.tku.edu.tw/.well-known/openid-configuration";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const type = res.headers.get("content-type") || "";
    const server = res.headers.get("server") || "";
    const text = await res.text();
    if (type.includes("json") && text.includes("authorization_endpoint")) {
      return { ok: true, kind: "oidc", detail: "找到 OpenID discovery" };
    }
    if (server.includes("WebSEAL") || text.includes("WebSEAL") || text.includes("單一登入")) {
      return { ok: false, kind: "webseal", detail: "公開端點是 IBM WebSEAL 登入頁，不是給第三方的 OIDC" };
    }
    return { ok: false, kind: "unknown", detail: `HTTP ${res.status} ${type}` };
  } catch (error) {
    return { ok: false, kind: "error", detail: error instanceof Error ? error.message : "probe failed" };
  }
}

export async function tkuAuthorizeUrl(origin: string, state: string, verifier: string): Promise<string> {
  const status = tkuStatus();
  if (!status.configured || !status.issuer) throw new Error(SSO_NOTE);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const discovery = await fetch(`${status.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`).then((res) => res.json());
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("client_id", process.env.TKU_OIDC_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", `${origin}/api/auth/tku/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", process.env.TKU_OIDC_SCOPES || "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function pkceVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export async function tkuExchange(origin: string, code: string, verifier: string): Promise<{ subject: string; email?: string; name: string; raw: Record<string, unknown> }> {
  const issuer = process.env.TKU_OIDC_ISSUER || "";
  const discovery = await fetch(`${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`).then((res) => res.json());
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${origin}/api/auth/tku/callback`,
    client_id: process.env.TKU_OIDC_CLIENT_ID || "",
    client_secret: process.env.TKU_OIDC_CLIENT_SECRET || "",
    code_verifier: verifier,
  });
  const token = await fetch(discovery.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }).then((res) => res.json());
  if (!token.access_token) throw new Error("淡江 SSO 沒有核發 token");
  const profile = await fetch(discovery.userinfo_endpoint, { headers: { Authorization: `Bearer ${token.access_token}` } }).then((res) => res.json());
  return {
    subject: String(profile.sub || id()),
    email: profile.email,
    name: profile.name || profile.preferred_username || "淡江同學",
    raw: { iss: issuer, sub: profile.sub, email: profile.email, name: profile.name },
  };
}
