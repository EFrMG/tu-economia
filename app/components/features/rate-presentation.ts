import type { IconType } from "react-icons";
import {
  MdCurrencyBitcoin,
  MdLanguage,
  MdOutlineAccountBalance,
  MdSwapHoriz,
} from "react-icons/md";

import type { Casa } from "~/lib/exchange-rates.server";

interface RatePresentation {
  /** Terminal-style title, already in the casing used by the design. */
  title: string;
  icon: IconType;
  /** Adds the accent glow reserved for the crypto tile. */
  glow?: boolean;
}

/** Display metadata for each quote the dashboard renders. */
export const RATE_PRESENTATION: Record<Casa, RatePresentation> = {
  blue: { title: "USD Blue", icon: MdSwapHoriz },
  oficial: { title: "Oficial BNA", icon: MdOutlineAccountBalance },
  bolsa: { title: "Dólar MEP", icon: MdSwapHoriz },
  contadoconliqui: { title: "Contado c/ Liqui", icon: MdLanguage },
  cripto: { title: "USDT Cripto", icon: MdCurrencyBitcoin, glow: true },
};
