export const FINANCE_TABS = [
  { id: "usuario", label: "Usuario" },
  { id: "presupuesto", label: "Presupuesto" },
  { id: "planificacion", label: "Planificación" },
  { id: "precios", label: "Precios" },
] as const;

export type FinanceTab = (typeof FINANCE_TABS)[number]["id"];

export const isFinanceTab = (value: string | null): value is FinanceTab =>
  FINANCE_TABS.some((tab) => tab.id === value);

/**
 * An explicit `?tab=` always wins. Without one, a visitor with no records and no session lands on Usuario, which explains local storage and account access; everyone else opens their month.
 */
export const resolveFinanceTab = (
  requested: string | null,
  isNewVisitor: boolean,
): FinanceTab =>
  isFinanceTab(requested)
    ? requested
    : isNewVisitor
      ? "usuario"
      : "presupuesto";

/** Builds a Mi economía URL that keeps the tab, month and dev preview flag together, so changing one never resets another. */
export function financeHref(
  tab: FinanceTab,
  month?: string,
  previewUnavailable = false,
) {
  const params = new URLSearchParams({ tab });
  if (month) params.set("month", month);
  if (previewUnavailable) params.set("preview", "unavailable");

  return `/mi-economia?${params.toString()}`;
}

/** Card ids on the Usuario tab. Links that ask for a subscription or an account point at them, and the card is highlighted while the URL carries its anchor. */
export const SUBSCRIPTION_ANCHOR = "suscripcion";
export const ACCOUNT_ANCHOR = "cuenta";

export function adjacentMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);

  return date.toISOString().slice(0, 7);
}
