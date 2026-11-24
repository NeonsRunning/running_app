import { describe, expect, it } from "vitest";
import {
  activeSalePercent,
  parseDonation,
  registrationTotal,
  salePrice,
  shippingCharge,
} from "./pricing";

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

/**
 * The orders `supabase/tests/database/children_medal_mail.test.sql` registers
 * through `register_for_event()`: $10 a child, $12 shipping and, where the
 * race mails medals, $6 for each child's medal. Both sides must arrive at the
 * same totals.
 */
describe("registrationTotal with children's medals by mail", () => {
  const mailsMedals = {
    shirtPrice: null,
    photoPrice: null,
    shippingPrice: 12,
    childShippingPrice: 6,
    donationRecipient: null,
  };
  const order = {
    extras: mailsMedals,
    shirt: false,
    photos: false,
    donation: 0,
    mail: true,
    salesTax: true,
    childPrice: 10,
  };

  it("adds the price per child to the shipping of an adult who runs", () => {
    const { tax, total } = registrationTotal({ ...order, price: 30, children: 2 });
    // 30 + 2 × 10 + 2 + 12 + 2 × 6 = 76; 76 × 0.115 = 8.74
    expect(tax).toBe(8.74);
    expect(total).toBe(84.74);
  });

  it("covers the first child with the shipping price when the adult is not racing", () => {
    const one = registrationTotal({ ...order, price: 0, racing: false, children: 1 });
    // 10 + 2 + 12 = 24; 24 × 0.115 = 2.76
    expect(one.tax).toBe(2.76);
    expect(one.total).toBe(26.76);

    const three = registrationTotal({ ...order, price: 0, racing: false, children: 3 });
    // 3 × 10 + 2 + 12 + 2 × 6 = 56; 56 × 0.115 = 6.44
    expect(three.tax).toBe(6.44);
    expect(three.total).toBe(62.44);
  });

  it("charges children nothing where the race mails no medals", () => {
    const { total } = registrationTotal({
      ...order,
      extras: { ...mailsMedals, childShippingPrice: null },
      salesTax: false,
      price: 30,
      children: 1,
    });
    // 30 + 10 + 2 + 12
    expect(total).toBe(54);
  });

  it("splits the charge into the shipment and the children's medals", () => {
    const charge = (racing: boolean, children: number, mail = true) =>
      shippingCharge({ mail, racing, children, extras: mailsMedals });

    expect(charge(true, 0)).toEqual({ base: 12, children: 0 });
    expect(charge(true, 3)).toEqual({ base: 12, children: 18 });
    expect(charge(false, 1)).toEqual({ base: 12, children: 0 });
    expect(charge(false, 3)).toEqual({ base: 12, children: 12 });
    expect(charge(true, 3, false)).toEqual({ base: 0, children: 0 });
    // Nothing of an adult who is not racing is mailed without medals to send.
    expect(
      shippingCharge({
        mail: true,
        racing: false,
        children: 2,
        extras: { ...mailsMedals, childShippingPrice: null },
      }),
    ).toEqual({ base: 0, children: 0 });
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

/**
 * The sale's two rules, as `active_sale_percent()` and `sale_price()` hold
 * them in the database; `supabase/tests/database/on_sale.test.sql` prices the
 * same sign-up and must arrive at the same total.
 */
describe("activeSalePercent", () => {
  const sale = { onSale: true, percent: 20, starts: null, ends: null };

  it("is off while the switch is off, whatever the dates", () => {
    expect(activeSalePercent({ ...sale, onSale: false }, "2026-12-05")).toBe(0);
  });

  it("runs without dates for as long as the switch is on", () => {
    expect(activeSalePercent(sale, "2026-12-05")).toBe(20);
  });

  it("runs from its first day through its last, both included", () => {
    const weekend = { ...sale, starts: "2026-12-05", ends: "2026-12-06" };
    expect(activeSalePercent(weekend, "2026-12-04")).toBe(0);
    expect(activeSalePercent(weekend, "2026-12-05")).toBe(20);
    expect(activeSalePercent(weekend, "2026-12-06")).toBe(20);
    expect(activeSalePercent(weekend, "2026-12-07")).toBe(0);
  });

  it("takes either date alone", () => {
    expect(activeSalePercent({ ...sale, starts: "2026-12-05" }, "2026-12-04")).toBe(0);
    expect(activeSalePercent({ ...sale, starts: "2026-12-05" }, "2027-01-01")).toBe(20);
    expect(activeSalePercent({ ...sale, ends: "2026-12-06" }, "2026-12-01")).toBe(20);
    expect(activeSalePercent({ ...sale, ends: "2026-12-06" }, "2026-12-07")).toBe(0);
  });
});

describe("salePrice", () => {
  it("takes the percentage off", () => {
    expect(salePrice(30, 20)).toBe(24);
    expect(salePrice(45, 0)).toBe(45);
    expect(salePrice(0, 50)).toBe(0);
  });

  it("rounds a half cent up, as Postgres does", () => {
    // 10.25 x 0.90 = 9.225; 0.15 x 0.90 = 0.135
    expect(salePrice(10.25, 10)).toBe(9.23);
    expect(salePrice(0.15, 10)).toBe(0.14);
    // 45.55 is not exact in binary; 45.55 x 0.85 = 38.7175
    expect(salePrice(45.55, 15)).toBe(38.72);
  });

  it("prices the sign-up on_sale.test.sql registers", () => {
    // A $30 race and a $10.25 child at 15% off: 25.50 and 8.71. Taxable:
    // 25.50 + 8.71 + 22 (shirt, not discounted) + 2 (fee) = 58.21.
    const { tax, total } = registrationTotal({
      price: salePrice(30, 15),
      extras,
      shirt: true,
      photos: false,
      donation: 0,
      mail: false,
      salesTax: true,
      children: 1,
      childPrice: salePrice(10.25, 15),
    });
    expect(tax).toBe(6.69);
    expect(total).toBe(64.9);
  });
});
