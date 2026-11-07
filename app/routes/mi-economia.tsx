import { isRouteErrorResponse, redirect } from "react-router";

import type { Route } from "./+types/mi-economia";
import {
  FinanceHeader,
  PersonalFinanceTracker,
} from "~/components/features/PersonalFinanceTracker";
import { RouteError } from "~/components/layout/RouteError";
import { argentinaCalendarDate } from "~/lib/exchange-rate-history";
import { authAvailability } from "~/lib/auth.server";
import {
  handleFinanceForm,
  loadFinanceState,
} from "~/lib/finance-store.server";
import { isFinanceTab, resolveFinanceTab } from "~/lib/finance-tabs";
import { buildLocalFinanceMonth } from "~/lib/local-finance";
import { pageMeta } from "~/lib/meta";
import { isMonth } from "~/lib/personal-finance";
import { workerEnvContext } from "~/lib/worker-context";

export function meta() {
  return pageMeta({
    title: "Mi economía",
    description:
      "Registro de sueldo, presupuesto por categorías y próximos gastos, guardado en su cuenta.",
    path: "/mi-economia",
    noIndex: true,
  });
}

function selectedMonth(url: URL) {
  const requested = url.searchParams.get("month");
  return requested && isMonth(requested)
    ? requested
    : argentinaCalendarDate(new Date()).slice(0, 7);
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(workerEnvContext);
  const url = new URL(request.url);

  const requestedMonth = url.searchParams.get("month");
  if (requestedMonth && !isMonth(requestedMonth)) {
    const next = new URL(url);
    next.searchParams.set("month", selectedMonth(url));
    throw redirect(`${next.pathname}${next.search}`);
  }

  const availability = authAvailability(env);
  const { document, ...state } = await loadFinanceState(request, env);
  const month = buildLocalFinanceMonth(document, selectedMonth(url), null);

  const isNewVisitor =
    state.access !== "edit" &&
    month.isFirstMonthSetup &&
    month.goals.length === 0;

  const requestedTab = url.searchParams.get("tab");
  const resolvedTab = resolveFinanceTab(requestedTab, isNewVisitor);
  if (requestedTab !== null && !isFinanceTab(requestedTab)) {
    const next = new URL(url);
    next.searchParams.set("tab", resolvedTab);
    throw redirect(`${next.pathname}${next.search}`);
  }

  return {
    month,
    account: {
      ...state,
      googleEnabled: availability.google,
      emailEnabled: availability.email,
    },
    tab: resolvedTab,
  };
}

export const action = ({ request, context }: Route.ActionArgs) =>
  handleFinanceForm(request, context.get(workerEnvContext));

export default function MiEconomia({ loaderData }: Route.ComponentProps) {
  return (
    <PersonalFinanceTracker
      data={loaderData.month}
      account={loaderData.account}
      tab={loaderData.tab}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const detail = isRouteErrorResponse(error)
    ? error.data || error.statusText
    : "No fue posible leer los registros guardados en su cuenta.";

  return (
    <div className="stack-8 pb-12">
      <FinanceHeader tab={null} />
      <RouteError
        title="No se pudieron leer sus registros"
        detail={detail}
        note="No se borró ningún registro. Actualice la página en unos minutos."
      />
    </div>
  );
}
