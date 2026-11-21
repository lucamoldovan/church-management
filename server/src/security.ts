import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { VeyraDatabase } from "./database.js";

const KEY_LENGTH = 64;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    }, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export interface Operator {
  id: string;
  username: string;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);

  return `scrypt$16384$8$1$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const [, n, r, p, saltHex, hashHex] = parts;
  if (n !== "16384" || r !== "8" || p !== "1" || !saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;

  const actual = await deriveKey(password, salt);

  return timingSafeEqual(actual, expected);
}

export function createSession(
  database: VeyraDatabase,
  operatorId: string,
): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();

  database.prepare(`
    INSERT INTO sessions (id, operator_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(randomUUID(), operatorId, hashSessionToken(token), expiresAt, now.toISOString());

  return { token, expiresAt };
}

export const SESSION_COOKIE = "veyra_session";
export const SESSION_TTL = SESSION_TTL_SECONDS;
