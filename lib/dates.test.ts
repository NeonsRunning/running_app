import { describe, expect, it } from "vitest";
import { addDays, daysBetween, puertoRicoDate, puertoRicoToday } from "./dates";

describe("puertoRicoToday", () => {
  it("is still today on the island after 20:00, when UTC has moved on", () => {
    // 21:30 on 19 Nov in San Juan is 01:30 on 20 Nov UTC.
    expect(puertoRicoToday(new Date("2026-11-20T01:30:00Z"))).toBe("2026-11-19");
  });

  it("turns over at midnight island time", () => {
    expect(puertoRicoToday(new Date("2026-11-20T03:59:59Z"))).toBe("2026-11-19");
    expect(puertoRicoToday(new Date("2026-11-20T04:00:00Z"))).toBe("2026-11-20");
  });
});

describe("puertoRicoDate", () => {
  it("reads a timestamp on the island's calendar", () => {
    expect(puertoRicoDate("2026-11-20T02:00:00+00:00")).toBe("2026-11-19");
  });
});

describe("addDays / daysBetween", () => {
  it("cross months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-11-20", "2026-11-19")).toBe(-1);
  });
});
