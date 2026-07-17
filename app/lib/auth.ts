import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ensureDatabase } from "../../db/runtime";

export type UserRole = "admin" | "customer";

export type RequestActor = {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
};

const SESSION_COOKIE = "the_zaza_club_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().slice(0, 180) : "";
}

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await derivePassword(password, salt)).toString("hex");
  return { hash, salt };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  try {
    const actual = await derivePassword(password, salt);
    const expected = Buffer.from(expectedHash, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  const db = await ensureDatabase();

  await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(tokenHash, userId, expiresAt).run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await ensureDatabase();
    await db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(hashSessionToken(token)).run();
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<RequestActor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await ensureDatabase();
  const user = await db.prepare(`SELECT u.id, u.email, u.display_name, u.role
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>CURRENT_TIMESTAMP AND u.status='active'`)
    .bind(hashSessionToken(token))
    .first<{ id: number; email: string; display_name: string; role: UserRole }>();

  return user
    ? { id: Number(user.id), email: user.email, displayName: user.display_name, role: user.role }
    : null;
}

export async function getRequestActor(): Promise<RequestActor | null> {
  return getCurrentUser();
}

export async function isAdminSetupRequired(): Promise<boolean> {
  const db = await ensureDatabase();
  const row = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND status='active'")
    .first<{ count: number | string }>();
  return Number(row?.count ?? 0) === 0;
}
