/**
 * The full names of the acronyms the pages abbreviate, shown by `ui/Acronym`.
 */
export const ACRONYMS = {
  CBA: "Canasta básica alimentaria",
  CBT: "Canasta básica total",
  CER: "Coeficiente de estabilización de referencia",
  CFT: "Costo financiero total",
  EMAE: "Estimador mensual de actividad económica",
  IPC: "Índice de precios al consumidor",
  REM: "Relevamiento de expectativas de mercado",
  TEA: "Tasa efectiva anual",
  TNA: "Tasa nominal anual",
  UVA: "Unidad de valor adquisitivo",
} as const satisfies Record<string, string>;

export type AcronymTerm = keyof typeof ACRONYMS;
