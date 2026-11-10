import { Suspense, useMemo } from "react";
import {
  Await,
  redirect,
  useLocation,
  type ShouldRevalidateFunctionArgs,
} from "react-router";

import type { Route } from "./+types/acciones";
import { CedearCalculatorPanel } from "~/components/features/CedearCalculator";
import {
  CompanyFiguresTable,
  CompanyFilingsTable,
  CompanyHeader,
  IssuerTable,
} from "~/components/features/CompanyFilings";
import { EquityMarketStrip } from "~/components/features/EquityMarketStrip";
import {
  CedearTable,
  EquityPanelSwitch,
  LeaderTable,
} from "~/components/features/EquityTables";
import { RouteError } from "~/components/layout/RouteError";
import { RouteFooter } from "~/components/ui/RouteFooter";
import {
  accionesLabel,
  equityPanelSource,
  isEquitiesBymaEnabled,
  panelNeedsRetry,
  resolveEquityPanel,
  unavailablePanel,
  type EquityPanelId,
  type EquityPanelSource,
} from "~/lib/acciones-panels";
import {
  CALCULATOR_PARAMS,
  UNAVAILABLE_REFERENCE_RATES,
  hasCalculatorParams,
  normaliseCalculatorParams,
  referenceRatesFrom,
  referenceRatesNeedRetry,
  type ReferenceRates,
} from "~/lib/cedear-calculator";
import {
  filingsNeedRetry,
  findIssuer,
  type CompanyFiguresData,
  type CompanyFilingsData,
  type CompanyPanel,
  type Issuer,
  type IssuerListData,
} from "~/lib/company-filings";
import {
  getCompanyFigures,
  getCompanyFilings,
  getIssuerList,
} from "~/lib/company-filings.server";
import { isUnavailablePreview } from "~/lib/data-preview";
import type {
  CedearPanelData,
  EquityPanel,
  LeaderPanelData,
  MarketIndex,
} from "~/lib/equities";
import {
  getCedearPanel,
  getIndexStrip,
  getLeaderPanel,
  getMarketOpen,
} from "~/lib/equities.server";
import { getLiveRates } from "~/lib/exchange-rates.server";
import { pageMeta } from "~/lib/meta";
import { useEquitiesBymaEnabled } from "~/lib/use-equities-byma-enabled";
import { useFailedDataRetry } from "~/lib/use-failed-data-retry";
import { workerEnvContext } from "~/lib/worker-context";

/** The description is true whether or not the BYMA panels are on: the SEC panel and the calculator are always there. */
export function meta({ loaderData }: Route.MetaArgs) {
  return pageMeta({
    title: accionesLabel(loaderData?.bymaEnabled ?? false),
    description:
      "Empresas argentinas que cotizan en los Estados Unidos, con sus informes ante la SEC y las cifras anuales que presentaron, y una calculadora del precio teórico de un CEDEAR según el CCL o el MEP.",
    path: "/acciones",
  });
}

/**
 * Resolves `?panel=` and `&empresa=` and streams only what the selected view needs.
 * While `EQUITIES_BYMA_ENABLED` is off, the BYMA panels redirect to the default panel and no BYMA function is called.
 * An unknown panel or company redirects to the normalised URL.
 * The calculator's parameters (`precio`, `ratio`, `referencia`, `tc`, `mercado`) are normalised on its panel and removed from every other, and `empresa` is removed from the calculator.
 */
export function loader({ request, context }: Route.LoaderArgs) {
  const bymaEnabled = isEquitiesBymaEnabled(context.get(workerEnvContext));
  const url = new URL(request.url);
  const requested = url.searchParams.get("panel");
  const panel = resolveEquityPanel(requested, bymaEnabled);

  const requestedTicker =
    panel === "empresas" ? url.searchParams.get("empresa") : null;

  const issuer = findIssuer(requestedTicker);

  const normalisedTicker =
    requestedTicker === null || issuer?.ticker === requestedTicker
      ? null
      : (issuer?.ticker ?? "");

  if (
    (requested !== null && requested !== panel) ||
    normalisedTicker !== null
  ) {
    const next = new URL(url);
    next.searchParams.set("panel", panel);

    if (panel !== "empresas" || !issuer) next.searchParams.delete("empresa");
    else next.searchParams.set("empresa", issuer.ticker);

    if (panel !== "calculadora")
      for (const param of CALCULATOR_PARAMS) next.searchParams.delete(param);

    throw redirect(`${next.pathname}${next.search}`);
  }

  if (panel === "calculadora") {
    const normalised = normaliseCalculatorParams(url.searchParams);
    const strayCompany = url.searchParams.has("empresa");

    if (normalised || strayCompany) {
      const next = new URL(url);
      next.search = (normalised ?? url.searchParams).toString();
      next.searchParams.delete("empresa");

      throw redirect(`${next.pathname}${next.search}`);
    }
  } else if (hasCalculatorParams(url.searchParams)) {
    const next = new URL(url);

    for (const param of CALCULATOR_PARAMS) next.searchParams.delete(param);

    throw redirect(`${next.pathname}${next.search}`);
  }

  const preview = isUnavailablePreview(url.searchParams);
  const byma = bymaEnabled && equityPanelSource(panel) === "byma";

  type MarketPanels = [EquityPanel<MarketIndex[]>, EquityPanel<boolean>];

  // One promise for the strip, so it streams as a unit and nothing is derived from loader promises on the client.
  const market: Promise<MarketPanels> | null = !byma
    ? null
    : preview
      ? Promise.resolve([unavailablePanel(), unavailablePanel()])
      : Promise.all([getIndexStrip(), getMarketOpen()]);

  // The quotations panel shows the strip and both tables, each streamed on its own so one failure leaves the others visible.
  const cedears: Promise<EquityPanel<CedearPanelData>> | null = !byma
    ? null
    : preview
      ? Promise.resolve(unavailablePanel())
      : getCedearPanel();

  const leaders: Promise<EquityPanel<LeaderPanelData>> | null = !byma
    ? null
    : preview
      ? Promise.resolve(unavailablePanel())
      : getLeaderPanel();

  const issuers: Promise<EquityPanel<IssuerListData>> | null =
    panel !== "empresas" || issuer
      ? null
      : preview
        ? Promise.resolve(unavailablePanel())
        : getIssuerList();

  const company: Promise<CompanyPanel<CompanyFilingsData>> | null = !issuer
    ? null
    : preview
      ? Promise.resolve(unavailablePanel())
      : getCompanyFilings(issuer.ticker);

  const figures: Promise<CompanyPanel<CompanyFiguresData>> | null = !issuer
    ? null
    : preview
      ? Promise.resolve(unavailablePanel())
      : getCompanyFigures(issuer.ticker);

  // The calculator's only upstream is Dólar API; a failure becomes the manual-rate state, never an error.
  const rates: Promise<ReferenceRates> | null =
    panel !== "calculadora"
      ? null
      : preview
        ? Promise.resolve(UNAVAILABLE_REFERENCE_RATES)
        : getLiveRates().then(
            referenceRatesFrom,
            () => UNAVAILABLE_REFERENCE_RATES,
          );

  return {
    bymaEnabled,
    panel,
    empresa: issuer?.ticker ?? null,
    previewUnavailable: preview,
    rates,
    market,
    cedears,
    leaders,
    issuers,
    company,
    figures,
  };
}

/**
 * The calculator writes its fields to the URL on blur and its reference toggle on change; neither needs new loader data, so those changes do not refetch the rates.
 * Any other change, and every explicit revalidation (the background retry), runs the loader as before.
 */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (
    formMethod ||
    currentUrl.pathname !== nextUrl.pathname ||
    currentUrl.search === nextUrl.search ||
    currentUrl.searchParams.get("panel") !== "calculadora" ||
    nextUrl.searchParams.get("panel") !== "calculadora"
  )
    return defaultShouldRevalidate;

  const current = new URLSearchParams(currentUrl.searchParams);
  const next = new URLSearchParams(nextUrl.searchParams);

  for (const param of CALCULATOR_PARAMS) {
    current.delete(param);
    next.delete(param);
  }

  return current.toString() === next.toString()
    ? false
    : defaultShouldRevalidate;
}

/** Shared by the page, its hydration fallback and its error state. It depends only on the flag, never on the panel, so switching panels does not move it. */
const AccionesHeader = ({ bymaEnabled }: { bymaEnabled: boolean }) => (
  <header className="stack-2">
    <h1 className="font-heading text-headline-lg text-text-100">
      {accionesLabel(bymaEnabled)}
    </h1>
    <p className="max-w-2xl text-body-lg text-text-200">
      {bymaEnabled
        ? "CEDEARs y acciones del panel líder del S&P Merval ordenados por monto operado, informes que las empresas argentinas con acciones en los Estados Unidos presentan ante la SEC y una calculadora del precio teórico de un CEDEAR."
        : "Informes y cifras anuales que las empresas argentinas con acciones en los Estados Unidos presentan ante la SEC, el regulador bursátil de ese país, y una calculadora del precio teórico de un CEDEAR."}
    </p>
  </header>
);

/** The delay and reference caveat BYMA's data requires, at the top of the quotations panel. */
const BymaDisclosure = () => (
  <p className="max-w-3xl text-body-sm text-text-400">
    Precios a 24 horas de BYMA Open Data, con una demora aproximada de 20
    minutos. Son de referencia y no constituyen una recomendación de inversión.
  </p>
);

interface MarketViewProps {
  /** `null` while loading, outside the streamed page. */
  market: Promise<[EquityPanel<MarketIndex[]>, EquityPanel<boolean>]> | null;
  cedears: Promise<EquityPanel<CedearPanelData>> | null;
  leaders: Promise<EquityPanel<LeaderPanelData>> | null;
}

/** The quotations panel: the disclosure, the index strip and market state, then the CEDEAR and leaders tables, each streamed on its own. */
const MarketView = ({ market, cedears, leaders }: MarketViewProps) => (
  <div className="stack-10">
    <div className="stack-6">
      <BymaDisclosure />
      {market ? (
        <Suspense
          fallback={<EquityMarketStrip indices={null} marketOpen={null} />}
        >
          <Await
            resolve={market}
            errorElement={
              <EquityMarketStrip
                indices={unavailablePanel()}
                marketOpen={unavailablePanel()}
              />
            }
          >
            {([indices, marketOpen]) => (
              <EquityMarketStrip indices={indices} marketOpen={marketOpen} />
            )}
          </Await>
        </Suspense>
      ) : (
        <EquityMarketStrip indices={null} marketOpen={null} />
      )}
    </div>

    {cedears ? (
      <Suspense fallback={<CedearTable panel={null} />}>
        <Await
          resolve={cedears}
          errorElement={<CedearTable panel={unavailablePanel()} />}
        >
          {(resolved) => <CedearTable panel={resolved} />}
        </Await>
      </Suspense>
    ) : (
      <CedearTable panel={null} />
    )}

    {leaders ? (
      <Suspense fallback={<LeaderTable panel={null} />}>
        <Await
          resolve={leaders}
          errorElement={<LeaderTable panel={unavailablePanel()} />}
        >
          {(resolved) => <LeaderTable panel={resolved} />}
        </Await>
      </Suspense>
    ) : (
      <LeaderTable panel={null} />
    )}
  </div>
);

const PANEL_SOURCES: Record<EquityPanelSource, string> = {
  byma: "Fuente: BYMA Open Data, con demora.",
  sec: "Fuente: SEC EDGAR.",
  dolarapi: "Fuente: Dólar API.",
};

const AccionesFooter = ({ panel }: { panel: EquityPanelId }) => (
  <RouteFooter>
    <p>{PANEL_SOURCES[equityPanelSource(panel)]}</p>
  </RouteFooter>
);

interface CompanyViewProps {
  issuer: Issuer;
  /** `null` while loading, outside the streamed page. */
  company: Promise<CompanyPanel<CompanyFilingsData>> | null;
  figures: Promise<CompanyPanel<CompanyFiguresData>> | null;
  previewUnavailable: boolean;
}

/** The selected company: its header and filings stream with the submissions request, the figures on their own. */
const CompanyView = ({
  issuer,
  company,
  figures,
  previewUnavailable,
}: CompanyViewProps) => (
  <div className="stack-10">
    {company ? (
      <Suspense
        fallback={
          <CompanyHeader
            issuer={issuer}
            panel={null}
            previewUnavailable={previewUnavailable}
          />
        }
      >
        <Await
          resolve={company}
          errorElement={
            <CompanyHeader
              issuer={issuer}
              panel={unavailablePanel()}
              previewUnavailable={previewUnavailable}
            />
          }
        >
          {(resolved) => (
            <CompanyHeader
              issuer={issuer}
              panel={resolved}
              previewUnavailable={previewUnavailable}
            />
          )}
        </Await>
      </Suspense>
    ) : (
      <CompanyHeader
        issuer={issuer}
        panel={null}
        previewUnavailable={previewUnavailable}
      />
    )}

    {figures ? (
      <Suspense fallback={<CompanyFiguresTable panel={null} />}>
        <Await
          resolve={figures}
          errorElement={<CompanyFiguresTable panel={unavailablePanel()} />}
        >
          {(resolved) => <CompanyFiguresTable panel={resolved} />}
        </Await>
      </Suspense>
    ) : (
      <CompanyFiguresTable panel={null} />
    )}

    {company ? (
      <Suspense fallback={<CompanyFilingsTable issuer={issuer} panel={null} />}>
        <Await
          resolve={company}
          errorElement={
            <CompanyFilingsTable issuer={issuer} panel={unavailablePanel()} />
          }
        >
          {(resolved) => (
            <CompanyFilingsTable issuer={issuer} panel={resolved} />
          )}
        </Await>
      </Suspense>
    ) : (
      <CompanyFilingsTable issuer={issuer} panel={null} />
    )}
  </div>
);

export default function Acciones({ loaderData }: Route.ComponentProps) {
  const { bymaEnabled, panel, empresa, previewUnavailable } = loaderData;
  const issuer = findIssuer(empresa);

  const retryNeeded = useMemo(
    () =>
      Promise.all([
        loaderData.market,
        loaderData.cedears,
        loaderData.leaders,
        loaderData.issuers,
        loaderData.company,
        loaderData.figures,
        loaderData.rates,
      ]).then(
        ([market, cedears, leaders, issuers, company, figures, rates]) =>
          [...(market ?? []), cedears, leaders].some(
            (item) => item !== null && panelNeedsRetry(item),
          ) ||
          [issuers, company, figures].some(
            (item) => item !== null && filingsNeedRetry(item),
          ) ||
          (rates !== null && referenceRatesNeedRetry(rates)),
        () => true,
      ),
    [
      loaderData.rates,
      loaderData.market,
      loaderData.cedears,
      loaderData.leaders,
      loaderData.issuers,
      loaderData.company,
      loaderData.figures,
    ],
  );

  useFailedDataRetry(retryNeeded);

  return (
    <div className="stack-10">
      <AccionesHeader bymaEnabled={bymaEnabled} />

      <div className="stack-6">
        <EquityPanelSwitch bymaEnabled={bymaEnabled} />

        {panel === "acciones" ? (
          <MarketView
            market={loaderData.market}
            cedears={loaderData.cedears}
            leaders={loaderData.leaders}
          />
        ) : null}

        {loaderData.issuers ? (
          <Suspense
            fallback={
              <IssuerTable
                panel={null}
                previewUnavailable={previewUnavailable}
              />
            }
          >
            <Await
              resolve={loaderData.issuers}
              errorElement={
                <IssuerTable
                  panel={unavailablePanel()}
                  previewUnavailable={previewUnavailable}
                />
              }
            >
              {(issuers) => (
                <IssuerTable
                  panel={issuers}
                  previewUnavailable={previewUnavailable}
                />
              )}
            </Await>
          </Suspense>
        ) : null}

        {issuer && loaderData.company && loaderData.figures ? (
          <CompanyView
            issuer={issuer}
            company={loaderData.company}
            figures={loaderData.figures}
            previewUnavailable={previewUnavailable}
          />
        ) : null}

        {loaderData.rates ? (
          <CedearCalculatorPanel rates={loaderData.rates} />
        ) : null}
      </div>

      <AccionesFooter panel={panel} />
    </div>
  );
}

/** The panel and company the URL asks for, resolved as the loader would; for the states without loader data. */
function useRequestedView() {
  const bymaEnabled = useEquitiesBymaEnabled();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const panel = resolveEquityPanel(params.get("panel"), bymaEnabled);

  return {
    bymaEnabled,
    panel,
    issuer: panel === "empresas" ? findIssuer(params.get("empresa")) : null,
    previewUnavailable: isUnavailablePreview(params),
  };
}

/** The skeleton of the panel the URL asks for, before loader data exists. */
const ActivePanelLoading = () => {
  const { panel, issuer, previewUnavailable } = useRequestedView();

  if (panel === "acciones")
    return <MarketView market={null} cedears={null} leaders={null} />;

  if (panel === "calculadora") return <CedearCalculatorPanel rates={null} />;

  return issuer ? (
    <CompanyView
      issuer={issuer}
      company={null}
      figures={null}
      previewUnavailable={previewUnavailable}
    />
  ) : (
    <IssuerTable panel={null} previewUnavailable={previewUnavailable} />
  );
};

export function HydrateFallback() {
  const { bymaEnabled, panel } = useRequestedView();

  return (
    <div className="stack-10">
      <AccionesHeader bymaEnabled={bymaEnabled} />
      <div className="stack-6">
        <EquityPanelSwitch bymaEnabled={bymaEnabled} />
        <ActivePanelLoading />
      </div>
      <AccionesFooter panel={panel} />
    </div>
  );
}

export function ErrorBoundary() {
  const { bymaEnabled, panel } = useRequestedView();

  return (
    <div className="stack-10">
      <AccionesHeader bymaEnabled={bymaEnabled} />
      <RouteError
        title={`${accionesLabel(bymaEnabled)} no disponibles`}
        detail="No fue posible mostrar esta sección en este momento. Actualice la página en unos minutos."
      />
      <AccionesFooter panel={panel} />
    </div>
  );
}
