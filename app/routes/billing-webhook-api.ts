import type { Route } from "./+types/billing-webhook-api";
import { handleBillingWebhook } from "~/lib/billing.server";
import { workerEnvContext } from "~/lib/worker-context";

export const loader = ({ request, context }: Route.LoaderArgs) =>
  handleBillingWebhook(request, context.get(workerEnvContext));

export const action = ({ request, context }: Route.ActionArgs) =>
  handleBillingWebhook(request, context.get(workerEnvContext));
