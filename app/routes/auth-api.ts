import type { Route } from "./+types/auth-api";
import { authFromEnv } from "~/lib/auth.server";
import { workerEnvContext } from "~/lib/worker-context";

const unavailable = () =>
  new Response("Account access is unavailable", {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });

const handle = async (request: Request, env: CloudflareEnvironment) => {
  const auth = authFromEnv(env);
  if (!auth) return unavailable();

  const response = await auth.handler(request);
  response.headers.set("Cache-Control", "private, no-store");

  return response;
};

export const loader = ({ request, context }: Route.LoaderArgs) =>
  handle(request, context.get(workerEnvContext));

export const action = ({ request, context }: Route.ActionArgs) =>
  handle(request, context.get(workerEnvContext));
