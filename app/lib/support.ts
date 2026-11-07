const REPOSITORY_URL = "https://github.com/EFrMG/tu-economia";

const EMAIL = "macias.francisco.355237995@gmail.com";

export const SUPPORT_REPOSITORY_URL = REPOSITORY_URL;

export const SUPPORT_REPOSITORY_ISSUES_URL = `${REPOSITORY_URL}/issues`;

export const SUPPORT_EMAIL = EMAIL;

export const SUPPORT_MAILTO_URL = `mailto:${EMAIL}?subject=${encodeURIComponent("Soporte · Tu Economía")}`;

export const MERCADO_PAGO_ALIAS = "erwin.144.divide.mp";

export const SUPPORT_DONATIONS = [
  { label: "Ko-fi", href: "https://ko-fi.com/efrmg" },
  { label: "Liberapay", href: "https://liberapay.com/EFrMG/" },
  { label: "Buy Me a Coffee", href: "https://www.buymeacoffee.com/efrmg" },
  { label: "GitHub Sponsors", href: "https://github.com/sponsors/EFrMG" },
] as const;
