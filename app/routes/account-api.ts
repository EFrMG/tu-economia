import type { Route } from "./+types/account-api";
import { handleAccountDeletion } from "~/lib/finance-store.server";
import { workerEnvContext } from "~/lib/worker-context";

export const loader = ({ request, context }: Route.LoaderArgs) =>
  handleAccountDeletion(request, context.get(workerEnvContext));

export const action = ({ request, context }: Route.ActionArgs) =>
  handleAccountDeletion(request, context.get(workerEnvContext));
