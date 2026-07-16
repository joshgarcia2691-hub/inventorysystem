import InventoryApp from "./InventoryApp";

export const dynamic = "force-dynamic";

export default function Home() {
  const deployed = Boolean(process.env.VERCEL);
  return <InventoryApp user={{ displayName: deployed ? "Vercel workspace user" : "Local Admin", email: deployed ? "Protected deployment" : "local-admin@stockwise.test" }} />;
}
