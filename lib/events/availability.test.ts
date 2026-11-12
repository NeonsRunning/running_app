import { describe, expect, it } from "vitest";
import { isEndingSoon, isNewEvent, registrationStatus, spotsLeft } from "./availability";

const TODAY = "2026-11-24";
const dates = { registration_closes: "2026-12-01", registration_opens: null };
const cat = (registered: number, capacity: number) => ({ registered, capacity });

describe("registrationStatus", () => {
  it("is open with room to spare", () => {
    expect(registrationStatus(dates, 10, 100, [cat(10, 100)], TODAY)).toBe("open");
  });

  it("is almost full from 90%", () => {
    expect(registrationStatus(dates, 90, 100, [cat(90, 100)], TODAY)).toBe("almost-full");
  });

  it("is open rather than almost full while the spots left are hidden", () => {
    const hidden = { ...dates, show_spots_left: false };
    expect(registrationStatus(hidden, 90, 100, [cat(90, 100)], TODAY)).toBe("open");
    // Full still reads as full: registration is refused either way.
    expect(registrationStatus(hidden, 100, 100, [cat(100, 100)], TODAY)).toBe("full");
  });

  it("is full once the event's own cap is reached, whatever the categories", () => {
    expect(
      registrationStatus(dates, 50, 50, [cat(30, 100), cat(20, 100)], TODAY),
    ).toBe("full");
    expect(registrationStatus(dates, 60, 50, [cat(60, 100)], TODAY)).toBe("full");
  });

  it("is full once every category is", () => {
    expect(
      registrationStatus(dates, 30, 100, [cat(10, 10), cat(20, 20)], TODAY),
    ).toBe("full");
  });

  it("is not full while one category has room", () => {
    expect(
      registrationStatus(dates, 15, 30, [cat(10, 10), cat(5, 20)], TODAY),
    ).toBe("open");
  });

  it("says closed or opening soon before anything about capacity", () => {
    expect(
      registrationStatus({ ...dates, registration_closes: "2026-11-23" }, 50, 50, [], TODAY),
    ).toBe("closed");
    expect(
      registrationStatus({ ...dates, registration_opens: "2026-11-25" }, 50, 50, [], TODAY),
    ).toBe("opening-soon");
  });

  it("is full when marked sold out, whatever the dates and counts say", () => {
    const marked = { ...dates, sold_out: true };
    expect(registrationStatus(marked, 0, 100, [cat(0, 100)], TODAY)).toBe("full");
    expect(
      registrationStatus({ ...marked, registration_closes: "2025-03-01" }, 0, 100, [], TODAY),
    ).toBe("full");
    expect(
      registrationStatus({ ...marked, registration_opens: "2026-11-25" }, 0, 100, [], TODAY),
    ).toBe("full");
  });

  it("is still open on registration's last day", () => {
    expect(
      registrationStatus({ ...dates, registration_closes: TODAY }, 0, 10, [cat(0, 10)], TODAY),
    ).toBe("open");
  });
});

describe("spotsLeft", () => {
  it("never goes below zero", () => {
    expect(spotsLeft(100, 40)).toBe(60);
    expect(spotsLeft(50, 60)).toBe(0);
  });
});

describe("isNewEvent", () => {
  const now = Date.parse("2026-11-12T12:00:00Z");
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();

  it("is new for the first two weeks after creation", () => {
    expect(isNewEvent(daysAgo(0), now)).toBe(true);
    expect(isNewEvent(daysAgo(13.9), now)).toBe(true);
  });

  it("is no longer new once two weeks have passed", () => {
    expect(isNewEvent(daysAgo(14), now)).toBe(false);
    expect(isNewEvent(daysAgo(30), now)).toBe(false);
  });
});

describe("isEndingSoon", () => {
  const today = "2026-11-12";
  const race = {
    event_date: "2026-12-20",
    end_date: null,
    registration_closes: "2026-12-15",
  };

  it("is ending soon when open sign-ups close within two weeks", () => {
    expect(isEndingSoon({ ...race, registration_closes: "2026-11-12" }, "open", today)).toBe(true);
    expect(isEndingSoon({ ...race, registration_closes: "2026-11-25" }, "almost-full", today)).toBe(true);
    expect(isEndingSoon({ ...race, registration_closes: "2026-11-26" }, "open", today)).toBe(false);
  });

  it("ignores the closing date once sign-ups are not open", () => {
    const closing = { ...race, registration_closes: "2026-11-20" };
    expect(isEndingSoon(closing, "full", today)).toBe(false);
    expect(isEndingSoon(closing, "opening-soon", today)).toBe(false);
    expect(isEndingSoon({ ...race, registration_closes: "2026-11-11" }, "closed", today)).toBe(false);
  });

  it("is ending soon when a multi-day event under way ends within two weeks", () => {
    const underway = { event_date: "2026-11-01", end_date: "2026-11-20", registration_closes: "2026-11-05" };
    expect(isEndingSoon(underway, "closed", today)).toBe(true);
    expect(isEndingSoon({ ...underway, end_date: "2026-11-30" }, "closed", today)).toBe(false);
  });

  it("waits for a multi-day event to start", () => {
    const upcoming = { event_date: "2026-11-15", end_date: "2026-11-20", registration_closes: "2026-12-31" };
    expect(isEndingSoon(upcoming, "open", today)).toBe(false);
  });
});
