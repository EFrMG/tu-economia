import type { Route } from "./+types/billing-api";
import { handleBilling } from "~/lib/billing.server";
import { workerEnvContext } from "~/lib/worker-context";

export const loader = ({ request, context }: Route.LoaderArgs) =>
  handleBilling(request, context.get(workerEnvContext));

export const action = ({ request, context }: Route.ActionArgs) =>
  handleBilling(request, context.get(workerEnvContext));
