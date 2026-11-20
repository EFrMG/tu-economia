import { describe, expect, it } from "vitest";

import {
  editionParam,
  formatEditionDate,
  noticeHeadline,
  resolveNewsPanel,
  resumenBoletinNotices,
  type BoletinNotice,
} from "~/lib/boletin";

const notice = (overrides: Partial<BoletinNotice>): BoletinNotice => ({
  id: "1",
  url: "https://www.boletinoficial.gob.ar/detalleAviso/primera/1/20261119",
  rubro: "RESOLUCIONES",
  heading: "MINISTERIO DE ECONOMÍA",
  norm: "Resolución 2000/2026",
  hasAnnexes: false,
  status: "summarized",
  title: "Título",
  summary: "Resumen",
  points: [],
  affectsHouseholds: true,
  partial: false,
  ...overrides,
});

describe("Noticias panels", () => {
  it("opens the Boletín panel only while the digest is enabled", () => {
    expect(resolveNewsPanel("boletin", true)).toBe("boletin");
    expect(resolveNewsPanel("boletin", false)).toBe("medios");
    expect(resolveNewsPanel("otro", true)).toBe("medios");
    expect(resolveNewsPanel(null, true)).toBe("medios");
  });
});

describe("Boletín digest presentation", () => {
  it("shows at most three household summaries on Resumen", () => {
    const notices = [
      notice({ id: "1" }),
      notice({ id: "2", affectsHouseholds: false }),
      notice({ id: "3", status: "title_only" }),
      notice({ id: "4" }),
      notice({ id: "5" }),
      notice({ id: "6" }),
    ];

    expect(
      resumenBoletinNotices({
        editionDate: "2026-11-19",
        notices,
        pending: 0,
        previous: null,
        next: null,
      }).map((item) => item.id),
    ).toEqual(["1", "4", "5"]);
  });

  it("reads an edition date from the URL and ignores anything else", () => {
    expect(editionParam("2026-11-18")).toBe("2026-11-18");
    expect(editionParam(null)).toBeNull();
    expect(editionParam("18/11/2026")).toBeNull();
    expect(editionParam("2026-11-18' OR 1=1")).toBeNull();
  });

  it("falls back to the official reference as headline", () => {
    expect(noticeHeadline(notice({ title: null }))).toBe(
      "MINISTERIO DE ECONOMÍA · Resolución 2000/2026",
    );
  });

  it("writes the edition date in Spanish", () => {
    expect(formatEditionDate("2026-11-19")).toBe("19 de noviembre de 2026");
  });
});
