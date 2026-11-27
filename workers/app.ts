import { createRequestHandler, RouterContextProvider } from "react-router";

import { pruneBoletin, runBoletinSteps } from "../app/lib/boletin.server";
import { runFinanceRetention } from "../app/lib/finance-retention.server";
import { scheduledTask } from "../app/lib/scheduled-tasks";
import { runRefreshSlot } from "../app/lib/source-refresh.server";
import { withBaselineHeaders } from "../app/lib/security-headers.server";
import { workerEnvContext } from "../app/lib/worker-context";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

/**
 * One line per step in Workers Logs, written as each step ends, so the digest's progress and failures can be followed without a dashboard: a run that summarizes three notices writes three `processed` lines, and an error after the first still leaves its line.
 */
const boletinRun = async (env: CloudflareEnvironment, now: Date) => {
  try {
    for await (const result of runBoletinSteps(env, now))
      console.log(JSON.stringify({ job: "boletin", ...result }));
  } catch (error) {
    console.error(JSON.stringify({ job: "boletin", error: String(error) }));
  }
};

export default {
  fetch(request, env) {
    const context = new RouterContextProvider();
    context.set(workerEnvContext, env);

    return requestHandler(request, context).then(withBaselineHeaders);
  },
  scheduled(controller, env, ctx) {
    const now = new Date(controller.scheduledTime);
    const task = scheduledTask(controller.cron, controller.scheduledTime);

    if (task.kind === "daily-maintenance") {
      ctx.waitUntil(
        Promise.all([runFinanceRetention(env, now), pruneBoletin(env, now)]),
      );

      return;
    }

    if (task.kind === "source-refresh") {
      ctx.waitUntil(
        runRefreshSlot(env, now, task.slot).then((outcome) => {
          // With every copy already refreshed today, the run goes to the digest instead.
          if (!outcome) return boletinRun(env, now);

          // One line per refresh, so a failing source or an expired INDEC token shows in Workers Logs even with no visitors.
          (outcome.status === "failed" ? console.error : console.log)(
            JSON.stringify({ job: "source-refresh", ...outcome }),
          );
        }),
      );

      return;
    }

    ctx.waitUntil(boletinRun(env, now));
  },
} satisfies ExportedHandler<CloudflareEnvironment>;
