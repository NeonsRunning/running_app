import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDistance,
  formatEventDates,
  formatLongDate,
  formatMonthRange,
  formatMonthShort,
  formatMoney,
  formatMoneyWhole,
  formatWeekdayShort,
} from "./format";

/** ICU may put a no-break space where a space is; compare them as one. */
const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("dates", () => {
  it("writes a long date in each language, on the day given", () => {
    expect(formatLongDate("2026-11-07", "en")).toBe("Saturday, November 7, 2026");
    expect(formatLongDate("2026-11-07", "es")).toMatch(/^sábado, 7 de noviembre de 2026$/);
  });

  it("writes one date, or a range across several days", () => {
    expect(formatEventDates("2026-11-07", undefined, "en")).toBe("Saturday, November 7, 2026");
    // An end on or before the start is a one-day event.
    expect(formatEventDates("2026-11-07", "2026-11-07", "en")).toBe(
      "Saturday, November 7, 2026",
    );
    expect(formatEventDates("2026-10-30", "2026-11-01", "en")).toBe(
      "October 30, 2026 – November 1, 2026",
    );
  });

  it("shortens weekday and month for the date blocks, without a trailing dot", () => {
    expect(formatWeekdayShort("2026-11-07", "en")).toBe("SAT");
    expect(formatWeekdayShort("2026-11-07", "es")).toBe("SÁB");
    expect(formatMonthShort("2026-09-01", "en")).toBe("SEP");
    expect(formatMonthShort("2026-09-01", "es")).not.toMatch(/\.$/);
  });

  it("writes a month range with the year once when shared", () => {
    expect(formatMonthRange("2026-09-01", "2026-11-30", "en")).toBe(
      "September — November 2026",
    );
    expect(formatMonthRange("2027-01-03", "2027-01-30", "en")).toBe("January 2027");
    expect(formatMonthRange("2026-12-01", "2027-01-30", "es")).toBe(
      "Diciembre de 2026 — enero de 2027",
    );
  });
});

describe("formatClock", () => {
  it("rewrites a fixture clock in each language", () => {
    expect(formatClock("6:00 PM", "en")).toBe("6:00 PM");
    expect(formatClock("6:00 PM", "es")).toBe("6:00 p. m.");
    expect(formatClock("12:30 am", "es")).toBe("12:30 a. m.");
    expect(formatClock("00:15 AM", "en")).toBe("12:15 AM");
  });

  it("leaves anything else as it is", () => {
    expect(formatClock("18:00", "en")).toBe("18:00");
  });
});

describe("numbers", () => {
  it("formats dollars", () => {
    expect(plain(formatMoney(30, "en"))).toBe("$30.00");
    expect(plain(formatMoneyWhole(30.4, "en"))).toBe("$30");
    expect(plain(formatMoney(1234.5, "es"))).toMatch(/1,234\.50|1234\.50|1\.234,50/);
  });

  it("writes distances with the language's decimal mark", () => {
    expect(formatDistance(21.0975, "en")).toBe("21.1 km");
    expect(formatDistance(42.195, "es")).toMatch(/^42[.,]2 km$/);
    expect(formatDistance(5, "en")).toBe("5 km");
  });
});
