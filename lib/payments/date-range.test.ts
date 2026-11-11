import { describe, expect, it } from "vitest";
import { matchingPreset, parseDateRange, presetRange } from "./date-range";

describe("parseDateRange", () => {
  it("keeps real dates and drops the rest", () => {
    expect(parseDateRange("2026-03-01", "2026-02-31")).toEqual({
      from: "2026-03-01",
      to: null,
    });
    expect(parseDateRange(undefined, ["2026-01-01"])).toEqual({ from: null, to: null });
  });

  it("turns a backwards range around", () => {
    expect(parseDateRange("2026-03-31", "2026-03-01")).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });
});

describe("presetRange", () => {
  const today = "2026-03-15";

  it("counts today in the rolling ranges", () => {
    expect(presetRange("last7", today)).toEqual({ from: "2026-03-09", to: today });
    expect(presetRange("last30", today)).toEqual({ from: "2026-02-14", to: today });
  });

  it("covers calendar months and the year", () => {
    expect(presetRange("thisMonth", today)).toEqual({ from: "2026-03-01", to: today });
    expect(presetRange("lastMonth", today)).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(presetRange("lastMonth", "2026-01-10")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(presetRange("thisYear", today)).toEqual({ from: "2026-01-01", to: today });
  });

  it("recognizes a range that is exactly a preset", () => {
    expect(matchingPreset({ from: "2026-03-01", to: today }, today)).toBe("thisMonth");
    expect(matchingPreset({ from: "2026-03-02", to: today }, today)).toBeNull();
  });
});
