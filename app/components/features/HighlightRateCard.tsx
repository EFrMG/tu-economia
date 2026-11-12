import type { ExchangeRate } from "~/lib/exchange-rates.server";
import { formatAmount, formatSignedChange, trendOf } from "~/lib/format";
import { formatHighlightRateCardText } from "~/lib/rate-card-copy";
import { Sparkline } from "~/components/ui/Sparkline";
import { UnavailableStatus } from "~/components/ui/UnavailableNotice";
import { CopyableCard } from "~/components/features/CopyableCard";
import { Skeleton } from "~/components/ui/Skeleton";
import { useAnchorHighlight } from "~/lib/use-anchor-highlight";
import { RATE_PRESENTATION } from "./rate-presentation";

interface HighlightRateCardProps {
  rate: ExchangeRate | null;
  id?: string;
  loading?: boolean;
}

const badgeStyles = {
  up: "text-secondary-text-100 bg-secondary-500/10 border-secondary-500/20",
  down: "text-red-text-400 bg-red-text-400/10 border-red-text-400/20",
  flat: "text-text-200 bg-text-200/10 border-text-200/20",
} as const;

/** Hero metric: the reference rate, its daily variation and its recent curve. */
const HighlightRateCard = ({
  rate,
  id,
  loading = false,
}: HighlightRateCardProps) => {
  const { title } = RATE_PRESENTATION.blue;
  const trend = trendOf(rate?.changePct ?? null);
  const borderClassName = useAnchorHighlight(id);

  return (
    <CopyableCard
      id={id}
      copyLabel={`Copiar cotización de ${title}`}
      text={rate ? formatHighlightRateCardText(title, rate) : null}
      className={`group w-full shrink-0 overflow-hidden border bg-surface-950 p-5 transition-colors duration-200 focus-within:border-primary-500/50 focus-within:bg-surface-900/80 hover:border-primary-500/50 lg:w-96 xl:w-md ${borderClassName}`}
    >
      <div className="absolute top-0 left-0 h-px w-full bg-primary-500 opacity-50" />

      <div className="mb-4 flex items-start justify-between">
        <h2 className="flex items-center gap-2 font-mono text-label-caps text-text-200 uppercase">
          <span
            className={`${loading ? "bg-text-400" : rate ? "animate-pulse bg-primary-500" : "bg-tertiary-500/40"} h-2 w-2 rounded-full`}
            aria-hidden="true"
          />
          {title}
        </h2>
        <span
          className={`border px-2 py-0.5 font-mono text-data-label ${loading ? "border-base-700" : rate ? badgeStyles[trend] : "border-tertiary-500/20 bg-tertiary-500/5 text-tertiary-text-400"}`}
        >
          {loading ? (
            <Skeleton className="h-3 w-12" />
          ) : rate?.changePct == null ? (
            "s/d"
          ) : (
            formatSignedChange(rate.changePct)
          )}
        </span>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-4">
          <div>
            <span className="mb-1 block font-mono text-data-label text-nowrap text-text-200 uppercase">
              Venta (ARS)
            </span>
            <span className="block min-h-[1.2em] font-mono text-data-display text-primary-text-100">
              {loading ? (
                <Skeleton className="mt-1 h-[0.8em] w-32" />
              ) : rate ? (
                formatAmount(rate.venta)
              ) : (
                "s/d"
              )}
            </span>
          </div>

          <div>
            <span className="mb-1 block font-mono text-data-label text-nowrap text-text-200 uppercase">
              Compra (ARS)
            </span>
            <span className="block min-h-[1.2em] font-mono text-data-display text-primary-text-100">
              {loading ? (
                <Skeleton className="mt-1 h-[0.8em] w-32" />
              ) : rate ? (
                formatAmount(rate.compra)
              ) : (
                "s/d"
              )}
            </span>
          </div>
        </div>

        {/* The right-hand slot keeps its place in every state: curve, placeholder or notice. */}
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : rate ? (
          <div className="flex h-12 w-full items-end text-primary-500 opacity-80 transition-opacity group-hover:opacity-100">
            <Sparkline points={rate.history} />
          </div>
        ) : (
          <UnavailableStatus className="flex h-12 w-full items-end justify-end">
            Cotización no disponible.
          </UnavailableStatus>
        )}
      </div>
    </CopyableCard>
  );
};

export { HighlightRateCard };
