import { createSession, hashPassword, isAdminSetupRequired, normalizeEmail, type UserRole } from "../../../lib/auth";
import { ensureDatabase } from "../../../../db/runtime";

export const runtime = "nodejs";

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const displayName = cleanText(body.displayName, 120);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
    const role: UserRole | null = body.role === "admin" || body.role === "customer" ? body.role : null;

    if (!role || displayName.length < 2 || !validEmail(email)) {
      return Response.json({ error: "Enter your name and a valid email address." }, { status: 400 });
    }
    if (password.length < 10) {
      return Response.json({ error: "Use a password with at least 10 characters." }, { status: 400 });
    }
    if (role === "admin" && !(await isAdminSetupRequired())) {
      return Response.json({ error: "The administrator account is already configured." }, { status: 403 });
    }

    const db = await ensureDatabase();
    const { hash, salt } = await hashPassword(password);
    const created = await db.prepare(`INSERT INTO users
      (email, display_name, password_hash, password_salt, role)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(email, displayName, hash, salt, role).run();
    const userId = Number(created.meta.last_row_id);

    await db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
      VALUES (?, 'created', 'account', ?, ?)`)
      .bind(email, String(userId), `${role} account`).run();
    await createSession(userId);

    return Response.json({ ok: true, user: { id: userId, email, displayName, role } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("duplicate key") || message.includes("unique constraint")) {
      return Response.json({ error: "That email is already registered, or the administrator is already configured." }, { status: 409 });
    }
    return Response.json({ error: "The account could not be created. Please try again." }, { status: 500 });
  }
}
