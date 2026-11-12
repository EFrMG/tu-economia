import type { Route } from "./+types/api-status";
import { RouteError } from "~/components/layout/RouteError";
import {
  checkExchangeRateSources,
  getExchangeRateSourceHealth,
  type SourceHealth,
} from "~/lib/exchange-rates.server";
import {
  getEconomicNews,
  getNewsSourceHealth,
  type NewsSourceHealth,
} from "~/lib/economic-news.server";
import { NEWS_SOURCES } from "~/lib/economic-news";
import {
  checkEquitySources,
  getEquitySourceHealth,
} from "~/lib/equities.server";
import { getEconomicActivity } from "~/lib/economic-activity.server";
import { getEconomicActivitySourceHealth } from "~/lib/economic-activity.server";
import { getIndicators } from "~/lib/indicators.server";
import { getIndicatorSourceHealth } from "~/lib/indicators.server";
import { getIndecData, getIndecSourceHealth } from "~/lib/indec.server";
import { getPricesSourceHealth } from "~/lib/prices.server";
import { isEquitiesBymaEnabled } from "~/lib/acciones-panels";
import {
  checkCompanyFilingSources,
  getCompanyFilingSourceHealth,
} from "~/lib/company-filings.server";
import { isUnavailablePreview } from "~/lib/data-preview";
import { pageMeta } from "~/lib/meta";
import { withUpstreamTimeout } from "~/lib/upstream-timeout.server";
import { workerEnvContext } from "~/lib/worker-context";

interface StatusSource {
  name: string;
  detail: string;
  url: string;
  health: SourceHealth | NewsSourceHealth;
}

export function meta() {
  return pageMeta({
    title: "Estado de API",
    description:
      "Últimos resultados de consulta de las fuentes de datos de Tu Economía.",
    path: "/api-status",
    noIndex: true,
  });
}

const BCRA_SOURCE = {
  name: "BCRA (Estadísticas Monetarias)",
  detail: "Inflación, tasas, reservas, tipo de cambio, dinero y UVA",
  url: "https://www.bcra.gob.ar/apis-banco-central/",
} as const;

const INDEC_SOURCE = {
  name: "INDEC (Catálogo API-INDEC)",
  detail: "Canastas básicas, índice de salarios e IPC por rubro y región",
  url: "https://api.indec.gob.ar/",
} as const;

const COUNTRY_RISK_SOURCE = {
  name: "ArgentinaDatos (riesgo país)",
  detail: "Riesgo país informado por Ámbito",
  url: "https://argentinadatos.com/",
} as const;

const BYMA_SOURCE = {
  name: "BYMA Open Data",
  detail: "Cotizaciones de CEDEARs, acciones líderes e índices, con demora",
  url: "https://open.bymadata.com.ar/",
} as const;

const SEC_SOURCE = {
  name: "SEC EDGAR",
  detail:
    "Informes y cifras anuales de empresas argentinas que cotizan en EE. UU.",
  url: "https://www.sec.gov/edgar/search/",
} as const;

/**
 * Uses the application data paths; it does not run a separate availability probe.
 * While `EQUITIES_BYMA_ENABLED` is off, BYMA is neither checked nor listed.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.get(workerEnvContext);
  const bymaEnabled = isEquitiesBymaEnabled(env);

  if (isUnavailablePreview(new URL(request.url).searchParams)) {
    const checkedAt = new Date().toISOString();

    const health: SourceHealth = {
      status: "failed",
      lastSuccessfulFetchAt: null,
      lastFailureAt: checkedAt,
    };

    return {
      checkedAt,
      sources: [
        {
          name: "Dólar API",
          detail: "Cotizaciones de dólar en vivo",
          url: "https://dolarapi.com/docs/",
          health,
        },
        {
          name: "ArgentinaDatos",
          detail: "Cierres históricos de cotizaciones",
          url: "https://argentinadatos.com/",
          health,
        },
        { ...BCRA_SOURCE, health },
        { ...INDEC_SOURCE, health },
        { ...COUNTRY_RISK_SOURCE, health },
        {
          name: "Datos Argentina (EMAE)",
          detail: "Actividad económica mensual",
          url: "https://datos.gob.ar/",
          health,
        },
        ...(bymaEnabled ? [{ ...BYMA_SOURCE, health }] : []),
        { ...SEC_SOURCE, health },
        {
          name: "Precios Claros",
          detail: "Precios por cadena y ubicación",
          url: "https://preciosclaros.gob.ar/",
          health,
        },
        ...NEWS_SOURCES.map((source) => ({
          name: source.name,
          detail: "Feed RSS de noticias económicas",
          url: source.url,
          health,
        })),
      ] satisfies StatusSource[],
    };
  }

  const checkedAt = new Date().toISOString();
  let timedOut = false;
  try {
    await withUpstreamTimeout(10_000, () =>
      Promise.allSettled([
        checkExchangeRateSources(),
        getEconomicNews(),
        getIndicators(),
        getIndecData(env.INDEC_API_TOKEN),
        getEconomicActivity(),
        ...(bymaEnabled ? [checkEquitySources()] : []),
        checkCompanyFilingSources(),
      ]),
    );
  } catch {
    timedOut = true;
  }

  const exchange = getExchangeRateSourceHealth();
  const indicators = getIndicatorSourceHealth();
  const activity = getEconomicActivitySourceHealth();
  const equities = bymaEnabled ? getEquitySourceHealth() : null;
  const filings = getCompanyFilingSourceHealth();
  const prices = getPricesSourceHealth();
  const news = getNewsSourceHealth();

  const healthAfterTimeout = <T extends SourceHealth | NewsSourceHealth>(
    health: T,
  ): T =>
    timedOut && health.status === "not-checked"
      ? { ...health, status: "failed", lastFailureAt: checkedAt }
      : health;

  return {
    checkedAt,
    sources: [
      {
        name: "Dólar API",
        detail: "Cotizaciones de dólar en vivo",
        url: "https://dolarapi.com/docs/",
        health: healthAfterTimeout(exchange.live),
      },
      {
        name: "ArgentinaDatos",
        detail: "Cierres históricos de cotizaciones",
        url: "https://argentinadatos.com/",
        health: healthAfterTimeout(exchange.history),
      },
      { ...BCRA_SOURCE, health: healthAfterTimeout(indicators.bcra) },
      { ...INDEC_SOURCE, health: healthAfterTimeout(getIndecSourceHealth()) },
      {
        ...COUNTRY_RISK_SOURCE,
        health: healthAfterTimeout(indicators.countryRisk),
      },
      {
        name: "Datos Argentina (EMAE)",
        detail: "Actividad económica mensual",
        url: "https://datos.gob.ar/",
        health: healthAfterTimeout(activity),
      },
      ...(equities
        ? [{ ...BYMA_SOURCE, health: healthAfterTimeout(equities) }]
        : []),
      { ...SEC_SOURCE, health: healthAfterTimeout(filings) },
      {
        name: "Precios Claros",
        detail: "Precios por cadena y ubicación",
        url: "https://preciosclaros.gob.ar/",
        health: healthAfterTimeout(prices),
      },
      ...news.map((source) => ({
        name: source.name,
        detail: "Feed RSS de noticias económicas",
        url: source.url,
        health: healthAfterTimeout(source),
      })),
    ] satisfies StatusSource[],
  };
}

const statusCopy = {
  fetched: { label: "Actualizado", className: "text-secondary-text-400" },
  cached: { label: "Actualizado", className: "text-secondary-text-400" },
  partial: { label: "Datos parciales", className: "text-tertiary-text-400" },
  stale: { label: "Datos anteriores", className: "text-tertiary-text-400" },
  failed: { label: "No se pudo actualizar", className: "text-red-text-400" },
  "not-checked": { label: "Aún sin consultar", className: "text-text-400" },
} as const;

function formatTime(value: string | null) {
  if (!value) return "Sin consultas exitosas registradas";

  return `${new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value))} ART`;
}

function SourceRow({ source }: { source: StatusSource }) {
  const copy = statusCopy[source.health.status];
  return (
    <li className="grid border border-base-700 bg-surface-950 sm:grid-cols-2">
      <div className="stack-2 justify-center p-5">
        <a
          className="font-heading text-body-lg text-text-100 underline-offset-4 focus-visible:outline-none hocus:underline"
          href={source.url}
          target="_blank"
          rel="noreferrer"
        >
          {source.name}
        </a>
        <p className="text-body-sm text-text-200">{source.detail}</p>
      </div>
      <dl className="stack-4 items-center justify-center border-t border-base-700 p-5 sm:border-t-0 sm:border-l">
        <div className="flex items-baseline justify-center gap-2 whitespace-nowrap">
          <dt className="font-mono text-data-label text-text-200">Estado:</dt>
          <dd
            className={`font-mono text-label-caps uppercase ${copy.className}`}
          >
            {copy.label}
          </dd>
        </div>
        <div className="text-center">
          <dt className="font-mono text-label-caps text-text-200 uppercase">
            Última consulta exitosa
          </dt>
          <dd className="mt-1 font-mono text-data-label text-text-300">
            {formatTime(source.health.lastSuccessfulFetchAt)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** Shared by the page, its hydration fallback and its error state, so the page keeps its title in all three. */
const ApiStatusHeader = () => (
  <header className="stack-4 border-b border-base-700 pb-10">
    <p className="font-mono text-label-caps text-primary-text-100 uppercase">
      Transparencia de datos
    </p>
    <h1 className="font-heading text-headline-lg text-text-100">
      Estado de fuentes
    </h1>
    <p className="max-w-2xl text-body-lg text-text-300">
      Este registro resume los últimos resultados de las fuentes de
      cotizaciones, informes de empresas, indicadores, actividad económica,
      precios y noticias económicas obtenidos por esta instancia. Precios Claros
      se informa según su último uso y no se consulta al abrir esta página. El
      registro no mide disponibilidad en tiempo real ni la hora de publicación
      de una noticia o cotización.
    </p>
  </header>
);

export default function ApiStatus({ loaderData }: Route.ComponentProps) {
  return (
    <section className="page-container max-w-3xl py-16 sm:py-24">
      <ApiStatusHeader />

      <div className="mt-10 stack-4">
        <p className="font-mono text-data-label text-text-400">
          Verificado: {formatTime(loaderData.checkedAt)}
        </p>
        <ul className="stack-4" aria-label="Estado de las fuentes de datos">
          {loaderData.sources.map((source) => (
            <SourceRow key={source.name} source={source} />
          ))}
        </ul>
      </div>
    </section>
  );
}

export function HydrateFallback() {
  return (
    <section
      className="page-container max-w-3xl py-16 sm:py-24"
      aria-busy="true"
    >
      <ApiStatusHeader />
      <p className="mt-10 font-mono text-data-label text-text-400">
        Consultando fuentes de datos…
      </p>
    </section>
  );
}

export function ErrorBoundary() {
  return (
    <section className="page-container max-w-3xl py-16 sm:py-24">
      <ApiStatusHeader />
      <div className="mt-10">
        <RouteError
          title="Estado no disponible"
          detail="No fue posible preparar el registro de consultas en este momento. Actualice la página en unos minutos."
        />
      </div>
    </section>
  );
}
