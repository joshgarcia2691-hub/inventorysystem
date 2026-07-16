import { getChatGPTUser } from "../chatgpt-auth";

export type RequestActor = {
  email: string;
  displayName: string;
};

export async function getRequestActor(): Promise<RequestActor | null> {
  const user = await getChatGPTUser();
  if (user) {
    return { email: user.email, displayName: user.displayName };
  }

  if (process.env.NODE_ENV !== "production") {
    return { email: "local-admin@stockwise.test", displayName: "Local Admin" };
  }

  return null;
}
