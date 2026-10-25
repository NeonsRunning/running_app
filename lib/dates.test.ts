import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  isIsoDate,
  puertoRicoDate,
  puertoRicoMidnight,
  puertoRicoToday,
} from "./dates";

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

describe("isIsoDate", () => {
  it("accepts real calendar dates, leap days included", () => {
    expect(isIsoDate("2026-11-24")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-12-31")).toBe(true);
  });

  it("refuses dates that only roll over into real ones", () => {
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-04-31")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-00-10")).toBe(false);
    expect(isIsoDate("2026-01-00")).toBe(false);
  });

  it("refuses anything that is not YYYY-MM-DD", () => {
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate("2026-1-05")).toBe(false);
    expect(isIsoDate("2026-01-05T00:00")).toBe(false);
    expect(isIsoDate("05/01/2026")).toBe(false);
  });
});

describe("puertoRicoMidnight", () => {
  it("is 04:00 UTC on the same date", () => {
    expect(puertoRicoMidnight("2026-11-24").toISOString()).toBe("2026-11-24T04:00:00.000Z");
    expect(puertoRicoToday(puertoRicoMidnight("2026-03-01"))).toBe("2026-03-01");
  });
});
