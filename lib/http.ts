import { jwtVerify, SignJWT } from "jose";

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "dev-only-edupsy-secret-change-me-32b!");
}

export async function sealSession(sid: string): Promise<string> {
  return new SignJWT({ sid }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
}

export async function readSid(cookieHeader: string | null): Promise<string | null> {
  const match = cookieHeader?.match(/(?:^|; )edupsy_session=([^;]+)/);
  if (!match) return null;
  try {
    const { payload } = await jwtVerify(match[1], secret());
    return payload.sid ? String(payload.sid) : null;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string, clear = false): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  if (clear) return `edupsy_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  return `edupsy_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`;
}

export function originOf(req: Request): string {
  return (process.env.APP_ORIGIN || new URL(req.url).origin).replace(/\/$/, "");
}

export function json(data: unknown, status = 200, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...(extra as Record<string, string>) } });
}

export function fail(status: number, message: string, code = "error"): Response {
  return json({ error: { code, message } }, status);
}
