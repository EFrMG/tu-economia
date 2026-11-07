import { describe, expect, it } from "vitest";

import { withUnavailablePreview } from "./data-preview";

describe("unavailable preview helper", () => {
  it("keeps the resource URL unchanged when the page is not previewing", () => {
    expect(
      withUnavailablePreview("/resources/prices?location=caba", false),
    ).toBe("/resources/prices?location=caba");
  });

  it("adds the preview flag without dropping existing parameters", () => {
    expect(
      withUnavailablePreview(
        "/resources/prices?location=caba&ids=huevos",
        true,
      ),
    ).toBe("/resources/prices?location=caba&ids=huevos&preview=unavailable");
  });

  it("adds the preview flag to a URL without a query string", () => {
    expect(withUnavailablePreview("/resources/inflation-history", true)).toBe(
      "/resources/inflation-history?preview=unavailable",
    );
  });
});
