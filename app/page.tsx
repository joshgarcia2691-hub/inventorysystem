import { redirect } from "next/navigation";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import InventoryApp from "./InventoryApp";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    redirect(chatGPTSignInPath("/"));
  }

  return (
    <InventoryApp
      user={{
        displayName: user?.displayName ?? "Local Admin",
        email: user?.email ?? "local-admin@stockwise.test",
      }}
    />
  );
}
