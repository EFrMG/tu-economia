import { createRequestHandler, RouterContextProvider } from "react-router";

import { runFinanceRetention } from "../app/lib/finance-retention.server";
import { withBaselineHeaders } from "../app/lib/security-headers.server";
import { workerEnvContext } from "../app/lib/worker-context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env) {
    const context = new RouterContextProvider();
    context.set(workerEnvContext, env);

    return requestHandler(request, context).then(withBaselineHeaders);
  },
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runFinanceRetention(env));
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
