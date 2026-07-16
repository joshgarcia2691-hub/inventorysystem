import { createSession, normalizeEmail, type UserRole, verifyPassword } from "../../../lib/auth";
import { ensureDatabase } from "../../../../db/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
    const role = body.role === "admin" || body.role === "customer" ? body.role : null;
    if (!email || !password || !role) {
      return Response.json({ error: "Enter your email and password." }, { status: 400 });
    }

    const db = await ensureDatabase();
    const user = await db.prepare(`SELECT id, email, display_name, password_hash, password_salt, role
      FROM users WHERE lower(email)=? AND role=? AND status='active'`)
      .bind(email, role)
      .first<{ id: number; email: string; display_name: string; password_hash: string; password_salt: string; role: UserRole }>();

    if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
      return Response.json({ error: "The email or password is incorrect for this role." }, { status: 401 });
    }

    await createSession(Number(user.id));
    await db.prepare(`INSERT INTO audit_logs (actor, action, entity_type, entity_id, details)
      VALUES (?, 'signed in', 'account', ?, ?)`)
      .bind(user.email, String(user.id), `${role} portal`).run();

    return Response.json({
      ok: true,
      user: { id: Number(user.id), email: user.email, displayName: user.display_name, role: user.role },
    });
  } catch {
    return Response.json({ error: "Sign-in is temporarily unavailable. Please try again." }, { status: 500 });
  }
}
