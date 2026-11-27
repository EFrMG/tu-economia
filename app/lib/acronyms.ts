/**
 * The full names of the acronyms the pages abbreviate, shown by `ui/Acronym`.
 */
export const ACRONYMS = {
  CFT: "Costo financiero total",
  EMAE: "Estimador mensual de actividad económica",
  IPC: "Índice de precios al consumidor",
  TEA: "Tasa efectiva anual",
  TNA: "Tasa nominal anual",
} as const satisfies Record<string, string>;

export type AcronymTerm = keyof typeof ACRONYMS;
