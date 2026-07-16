import AuthGateway from "./AuthGateway";
import CustomerPortal from "./CustomerPortal";
import InventoryApp from "./InventoryApp";
import { getCurrentUser, isAdminSetupRequired } from "./lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <AuthGateway adminSetupRequired={await isAdminSetupRequired()} />;
  if (user.role === "customer") return <CustomerPortal user={user} />;
  return <InventoryApp user={user} />;
}
