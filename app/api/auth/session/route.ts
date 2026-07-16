import { getCurrentUser, isAdminSetupRequired } from "../../../lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [user, adminSetupRequired] = await Promise.all([
    getCurrentUser(),
    isAdminSetupRequired(),
  ]);
  return Response.json({ user, adminSetupRequired });
}
