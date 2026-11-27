import { describe, expect, it } from "vitest";

import { ROBOTS_TXT } from "./robots";

/** Google's matching, which ClaudeBot and Bing follow: the longest matching rule wins, `*` matches any run of characters and `Allow` wins a tie. */
function allowed(path: string): boolean {
  let best = { length: -1, allow: true };

  for (const line of ROBOTS_TXT.split("\n")) {
    const match = /^(Allow|Disallow): (.+)$/.exec(line);
    if (!match) continue;

    const [, directive, rule] = match;

    const pattern = new RegExp(
      `^${rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}`,
    );

    if (!pattern.test(path)) continue;

    const allow = directive === "Allow";

    if (rule.length > best.length || (rule.length === best.length && allow))
      best = { length: rule.length, allow };
  }

  return best.allow;
}

describe("robots.txt", () => {
  it("keeps crawlers on the Tasas panels and off their filtered and later pages", () => {
    expect(allowed("/tasas")).toBe(true);
    expect(allowed("/tasas?panel=prestamos")).toBe(true);
    expect(allowed("/tasas?panel=tarjetas")).toBe(true);
    expect(allowed("/tasas?panel=hipotecarios")).toBe(true);

    expect(allowed("/tasas?panel=prestamos&pagina=10")).toBe(false);
    expect(allowed("/tasas?pagina=12&panel=prestamos")).toBe(false);
    expect(allowed("/tasas?panel=prestamos&perfil=monotributistas")).toBe(
      false,
    );
    expect(allowed("/tasas?panel=prestamos&plazo=24&monto=2000000")).toBe(
      false,
    );
    expect(allowed("/tasas?panel=hipotecarios&destino=vivienda-unica")).toBe(
      false,
    );
    expect(allowed("/tasas?panel=hipotecarios&plazo=360&pagina=2")).toBe(false);
    expect(allowed("/tasas?panel=tarjetas&segmento=gold")).toBe(false);
    expect(allowed("/tasas?panel=tarjetas&provincia=cordoba")).toBe(false);
  });

  it("keeps crawlers off Mi economía's months and tabs, but not its bare path", () => {
    expect(allowed("/mi-economia")).toBe(true);

    expect(allowed("/mi-economia?month=2002-09&tab=precios")).toBe(false);
    expect(allowed("/mi-economia?tab=presupuesto")).toBe(false);
  });

  it("leaves the other pages open and the API and data endpoints closed", () => {
    expect(allowed("/")).toBe(true);
    expect(allowed("/dolar")).toBe(true);
    expect(allowed("/noticias?panel=boletin")).toBe(true);

    expect(allowed("/api/prices")).toBe(false);
    expect(allowed("/resources/prices?location=1&ids=2")).toBe(false);
    expect(allowed("/resources/inflation-history")).toBe(false);
  });

  it("points to the sitemap", () => {
    expect(ROBOTS_TXT).toMatch(/^Sitemap: .+\/sitemap\.xml$/m);
  });
});
