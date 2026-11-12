import type { Casa, ExchangeRate } from "~/lib/exchange-rates.server";
import { formatAmount } from "~/lib/format";
import { formatExchangeRateCardText } from "~/lib/rate-card-copy";
import { TrendIndicator } from "~/components/ui/TrendIndicator";
import { UnavailableStatus } from "~/components/ui/UnavailableNotice";
import { CopyableCard } from "~/components/features/CopyableCard";
import { Skeleton } from "~/components/ui/Skeleton";
import { useAnchorHighlight } from "~/lib/use-anchor-highlight";
import { RATE_PRESENTATION } from "./rate-presentation";

interface ExchangeRateCardProps {
  casa: Casa;
  rate: ExchangeRate | null;
  /** Contextual metric shown next to the daily variation. */
  footnote: string;
  id?: string;
  loading?: boolean;
}

/** Precision card: buy/sell cells over a variation footer. */
const ExchangeRateCard = ({
  casa,
  rate,
  footnote,
  id,
  loading = false,
}: ExchangeRateCardProps) => {
  const { title, icon: Icon, glow } = RATE_PRESENTATION[casa];
  const borderClassName = useAnchorHighlight(id);

  return (
    <CopyableCard
      id={id}
      copyLabel={`Copiar cotización de ${title}`}
      text={rate ? formatExchangeRateCardText(title, rate, footnote) : null}
      className={`overflow-hidden border bg-surface-950 p-4 transition-colors duration-200 focus-within:border-primary-500/50 focus-within:bg-surface-900/80 hover:border-primary-500/50 ${borderClassName}`}
    >
      {glow && (
        <div
          className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary-500/5 blur-2xl"
          aria-hidden="true"
        />
      )}

      <div className="relative z-10 mb-4 flex items-center justify-between">
        <h3 className="font-mono text-label-caps text-text-100 uppercase">
          {title}
        </h3>
        <Icon className="text-base text-text-200" aria-hidden="true" />
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-4">
        <RateCell
          label="Compra"
          value={rate?.compra ?? null}
          loading={loading}
        />
        <RateCell label="Venta" value={rate?.venta ?? null} loading={loading} />
      </div>

      {/* The row declares the data state's 12px line box, so notice and skeletons never resize the card. */}
      <div className="relative z-10 mt-4 flex h-3 items-center justify-between border-t border-base-700/50 pt-2">
        {loading ? (
          <>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-12" />
          </>
        ) : rate ? (
          <>
            <span className="font-mono text-data-label text-text-400">
              {footnote}
            </span>
            <TrendIndicator value={rate.changePct} />
          </>
        ) : (
          <UnavailableStatus>Cotización no disponible.</UnavailableStatus>
        )}
      </div>
    </CopyableCard>
  );
};

const RateCell = ({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | null;
  loading: boolean;
}) => (
  <div>
    <span className="mb-1 block border-b border-base-700/50 pb-1 font-mono text-data-label text-text-200 uppercase">
      {label}
    </span>
    <span className="mt-1 block min-h-[1.2em] font-mono text-data-display text-text-100">
      {loading ? (
        <Skeleton className="mt-1 h-[0.8em] w-24" />
      ) : value === null ? (
        "s/d"
      ) : (
        formatAmount(value)
      )}
    </span>
  </div>
);

export { ExchangeRateCard };
