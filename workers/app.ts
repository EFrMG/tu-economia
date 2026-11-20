import { createRequestHandler, RouterContextProvider } from "react-router";

import { pruneBoletin, runBoletinStep } from "../app/lib/boletin.server";
import { runFinanceRetention } from "../app/lib/finance-retention.server";
import { scheduledTask } from "../app/lib/scheduled-tasks";
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
  scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime);

    if (
      scheduledTask(controller.cron, controller.scheduledTime) ===
      "daily-maintenance"
    ) {
      ctx.waitUntil(
        Promise.all([runFinanceRetention(env, now), pruneBoletin(env, now)]),
      );

      return;
    }

    // One line per run in Workers Logs, so the digest's progress and failures can be followed without a dashboard.
    ctx.waitUntil(
      runBoletinStep(env, now).then(
        (result) => console.log(JSON.stringify({ job: "boletin", ...result })),
        (error: unknown) =>
          console.error(
            JSON.stringify({ job: "boletin", error: String(error) }),
          ),
      ),
    );
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
