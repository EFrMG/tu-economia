import type { Route } from "./+types/finance-export-api";
import { handleFinanceExport } from "~/lib/finance-store.server";
import { workerEnvContext } from "~/lib/worker-context";

export const loader = ({ request, context }: Route.LoaderArgs) =>
  handleFinanceExport(request, context.get(workerEnvContext));
