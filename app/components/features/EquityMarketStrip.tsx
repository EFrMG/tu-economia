import { Skeleton } from "~/components/ui/Skeleton";
import { TrendIndicator } from "~/components/ui/TrendIndicator";
import {
  UnavailableNotice,
  UnavailableStatus,
} from "~/components/ui/UnavailableNotice";
import type {
  EquityFreshness,
  EquityPanel,
  MarketIndex,
  MarketIndexSymbol,
} from "~/lib/equities";
import { formatAmount } from "~/lib/format";

/** Display order and names of the strip; the data layer may omit either index. */
const STRIP: { symbol: MarketIndexSymbol; name: string }[] = [
  { symbol: "M", name: "S&P Merval" },
  { symbol: "G", name: "S&P BYMA General" },
];

export const StaleNotice = ({ freshness }: { freshness: EquityFreshness }) =>
  freshness.status === "stale" ? (
    <UnavailableNotice>
      No fue posible actualizar estos datos. Se muestran los últimos valores
      recibidos. Última consulta exitosa: {freshness.fetchedAtLabel} ART.
    </UnavailableNotice>
  ) : null;

interface MarketStateProps {
  marketOpen: EquityPanel<boolean> | null;
  indices: EquityPanel<MarketIndex[]> | null;
}

/** Whether BYMA is trading and when the index values were received; each value keeps its slot in every state. */
const MarketState = ({ marketOpen, indices }: MarketStateProps) => (
  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-data-label text-text-400">
    <p className="flex h-3 items-center gap-2">
      <span>Mercado:</span>
      {marketOpen === null ? (
        <Skeleton className="h-3 w-14" />
      ) : marketOpen.status === "available" ? (
        <span className="text-text-100">
          {marketOpen.data ? "abierto" : "cerrado"}
        </span>
      ) : (
        <UnavailableStatus>s/d</UnavailableStatus>
      )}
    </p>
    <p className="flex h-3 items-center gap-2">
      <span>Consulta:</span>
      {indices === null ? (
        <Skeleton className="h-3 w-32" />
      ) : indices.status === "available" ? (
        <span>{indices.freshness.fetchedAtLabel} ART</span>
      ) : (
        <span>s/d</span>
      )}
    </p>
  </div>
);

interface IndexCardProps {
  name: string;
  index: MarketIndex | null;
  loading: boolean;
}

const IndexCard = ({ name, index, loading }: IndexCardProps) => (
  <div className="stack-2 border border-base-700 bg-surface-950 p-4">
    <h3 className="font-mono text-label-caps text-text-200 uppercase">
      {name}
    </h3>

    {loading ? (
      <div className="stack-2" aria-hidden="true">
        <span className="flex h-6 items-center">
          <Skeleton className="h-5 w-32" />
        </span>
        <span className="flex h-3 items-center">
          <Skeleton className="h-3 w-40" />
        </span>
      </div>
    ) : (
      <div className="stack-2">
        <p className="h-6 font-mono text-data-display text-text-100">
          {index ? formatAmount(index.value) : "s/d"}
        </p>
        {/* Without data the value reads s/d and the change line stays empty, at the same height. */}
        <span className="flex h-3 items-center">
          {index ? <TrendIndicator value={index.changePct} /> : null}
        </span>
      </div>
    )}
  </div>
);

interface EquityMarketStripProps {
  /** `null` while loading. */
  indices: EquityPanel<MarketIndex[]> | null;
  marketOpen: EquityPanel<boolean> | null;
}

/** Market state and the index strip; both cards render in every state, so the strip keeps its footprint. */
export const EquityMarketStrip = ({
  indices,
  marketOpen,
}: EquityMarketStripProps) => {
  const loading = indices === null;

  const bySymbol = new Map(
    indices?.status === "available"
      ? indices.data.map((index) => [index.symbol, index])
      : [],
  );

  return (
    <section
      className="stack-4"
      aria-labelledby="equity-indices-title"
      aria-busy={loading}
    >
      {loading ? (
        <span className="sr-only" role="status">
          Cargando índices.
        </span>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2
          id="equity-indices-title"
          className="shrink-0 border-b border-primary-500/30 pb-1 font-mono text-label-caps whitespace-nowrap text-text-200 uppercase"
        >
          Índices
        </h2>
        <MarketState marketOpen={marketOpen} indices={indices} />
      </div>

      {indices?.status === "available" ? (
        <StaleNotice freshness={indices.freshness} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {STRIP.map(({ symbol, name }) => (
          <IndexCard
            key={symbol}
            name={name}
            index={bySymbol.get(symbol) ?? null}
            loading={loading}
          />
        ))}
      </div>
    </section>
  );
};
