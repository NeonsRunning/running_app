import { describe, expect, it } from "vitest";
import { parseDonation, registrationTotal } from "./pricing";

const extras = { shirtPrice: 22, photoPrice: 12, shippingPrice: 8, donationRecipient: "" };

/**
 * The total `register_for_event()` stores, worked the same way in cents:
 * taxable = price + extras + $2 fee + shipping; tax = round(taxable × 11.5%);
 * total = taxable + tax + donation. These must agree, or a runner is charged
 * a different amount from the one they were shown.
 */
describe("registrationTotal", () => {
  it("taxes the price, extras, fee and shipping but not the donation", () => {
    const { tax, total } = registrationTotal({
      price: 45,
      extras,
      shirt: true,
      photos: true,
      donation: 10,
      mail: true,
      salesTax: true,
    });
    // 45 + 22 + 12 + 2 + 8 = 89; 89 × 0.115 = 10.235 → 10.24
    expect(tax).toBe(10.24);
    expect(total).toBe(109.24);
  });

  it("charges the fee and its tax on a free race", () => {
    const { tax, total } = registrationTotal({
      price: 0,
      extras,
      shirt: false,
      photos: false,
      donation: 0,
      mail: false,
      salesTax: true,
    });
    expect(tax).toBe(0.23);
    expect(total).toBe(2.23);
  });

  it("does not drift on prices that are not exact in binary", () => {
    const { total } = registrationTotal({
      price: 0.1 + 0.2,
      extras,
      shirt: false,
      photos: false,
      donation: 0.07,
      mail: false,
      salesTax: true,
    });
    expect(Number.isInteger(Math.round(total * 100))).toBe(true);
    expect(total).toBe(2.63);
  });
});

/**
 * The same sign-up `supabase/tests/database/pricing.test.sql` registers
 * through `register_for_event()`. Both must arrive at $92.51: if the fee or
 * the tax rate changes in one place only, one of the two tests fails, so the
 * form never shows a total the database will not charge.
 */
describe("registrationTotal on an event without sales tax", () => {
  it("charges no tax and totals the price, extras, fee and shipping", () => {
    const { tax, total } = registrationTotal({
      price: 45,
      extras,
      shirt: true,
      photos: true,
      donation: 10,
      mail: true,
      salesTax: false,
    });
    // 45 + 22 + 12 + 2 + 8 = 89, plus the $10 donation.
    expect(tax).toBe(0);
    expect(total).toBe(99);
  });
});

describe("registrationTotal agrees with register_for_event()", () => {
  it("prices the shared sign-up at $92.51", () => {
    const { tax, total } = registrationTotal({
      price: 30,
      extras: { shirtPrice: 22, photoPrice: 12, shippingPrice: 8, donationRecipient: "" },
      shirt: true,
      photos: true,
      donation: 10,
      mail: true,
      salesTax: true,
    });
    expect(tax).toBe(8.51);
    expect(total).toBe(92.51);
  });
});

/**
 * The two orders `supabase/tests/database/children.test.sql` registers
 * through `register_for_event()`, on a race that charges $10 a child and
 * sales tax. Both sides must arrive at the same totals.
 */
describe("registrationTotal with children", () => {
  const none = { shirtPrice: null, photoPrice: null, shippingPrice: null, donationRecipient: null };

  it("adds the child price per child, taxed, and the fee once", () => {
    const { tax, total } = registrationTotal({
      price: 30,
      extras: none,
      shirt: false,
      photos: false,
      donation: 0,
      mail: false,
      salesTax: true,
      children: 2,
      childPrice: 10,
    });
    // 30 + 2 × 10 + 2 = 52; 52 × 0.115 = 5.98
    expect(tax).toBe(5.98);
    expect(total).toBe(57.98);
  });

  it("prices an adult who signs up only a child at the child price and the fee", () => {
    const { tax, total } = registrationTotal({
      price: 0,
      extras: none,
      shirt: false,
      photos: false,
      donation: 0,
      mail: false,
      salesTax: true,
      children: 1,
      childPrice: 10,
    });
    // 10 + 2 = 12; 12 × 0.115 = 1.38
    expect(tax).toBe(1.38);
    expect(total).toBe(13.38);
  });

  it("still charges the fee when the children are free", () => {
    const { total } = registrationTotal({
      price: 0,
      extras: none,
      shirt: false,
      photos: false,
      donation: 0,
      mail: false,
      salesTax: false,
      children: 3,
      childPrice: 0,
    });
    expect(total).toBe(2);
  });
});

describe("parseDonation", () => {
  it.each([
    ["", 0],
    ["5", 5],
    ["12.5", 12.5],
    ["1000", 1000],
  ])("accepts %j", (text, amount) => {
    expect(parseDonation(text)).toBe(amount);
  });

  it.each(["-5", "1000.01", "abc", "1.234", "1e3"])("refuses %j", (text) => {
    expect(parseDonation(text)).toBeNull();
  });
});
