import { randomBytes, randomUUID } from "node:crypto";

export function id(): string {
  return randomUUID();
}

export function token(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
