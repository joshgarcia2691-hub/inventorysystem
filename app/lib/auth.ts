export type RequestActor = {
  email: string;
  displayName: string;
};

export async function getRequestActor(): Promise<RequestActor> {
  return process.env.VERCEL
    ? { email: "vercel-protected-user", displayName: "Vercel workspace user" }
    : { email: "local-admin@stockwise.test", displayName: "Local Admin" };
}
