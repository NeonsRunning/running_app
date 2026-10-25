import { describe, expect, it } from "vitest";
import { registrationStatus, spotsLeft } from "./availability";

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
