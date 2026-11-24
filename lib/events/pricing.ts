import type { EventExtras } from "@/lib/types";

/**
 * What a registration costs on top of the category price.
 *
 * Each event sets its own extras in the publish wizard; the shirt and photo
 * prices here are the starting values a new event gets, and what fixture
 * races charge. The registration flow uses these to show a running total; the
 * amount that is stored is computed again by `register_for_event()` in
 * `20261222120000_registration_shirts.sql`, which repeats the service fee,
 * the sales tax rate, how the mail and the shirts are charged and what a sale
 * takes off. Change them in both places.
 */
export const SHIRT_PRICE = 22;
/**
 * Shipping for each shirt on an order: shirts are always mailed. The starting
 * value of an event's own price (`events.shirt_shipping_price`).
 */
export const SHIRT_SHIPPING_PRICE = 6;
/** Shirts a runner can put on one sign-up; `register_for_event()` enforces it too. */
export const MAX_SHIRTS = 6;
export const PHOTO_PRICE = 12;
/** Shipping and handling for a kit sent by mail; added after the service fee. */
export const SHIPPING_PRICE = 8;
/** Shipping for each child's medal, on a race that mails medals. */
export const CHILD_SHIPPING_PRICE = 6;
export const SERVICE_FEE = 2;
/**
 * Puerto Rico sales tax (IVU), on everything but the donation. Charged only
 * on events whose organizer turned it on (`charges_sales_tax`).
 */
export const SALES_TAX_RATE = 0.115;
export const DONATIONS = [0, 5, 10, 25] as const;
/** Largest donation a runner can type in; `register_for_event()` enforces it too. */
export const MAX_DONATION = 1000;
/** Children an adult can add to one sign-up; `register_for_event()` enforces it too. */
export const MAX_CHILDREN = 3;

/**
 * The least and most a sale takes off, in whole percent, and what a new
 * event's sale starts at. `save_event()` and the table check the same range.
 */
export const SALE_PERCENT_MIN = 5;
export const SALE_PERCENT_MAX = 90;
export const SALE_PERCENT = 20;

/** An event's sale as stored: the switch, the discount and its optional days. */
export type SaleTerms = {
  onSale: boolean;
  /** Whole percent off each distance and each child. */
  percent: number;
  /** First and last day, YYYY-MM-DD and inclusive; null leaves that end open. */
  starts: string | null;
  ends: string | null;
};

/**
 * Whole percent off on `today` (the island's, YYYY-MM-DD): 0 when the sale is
 * switched off or the day falls outside its dates. The same rule as
 * `active_sale_percent()` in `20261221120000_on_sale.sql`, which decides what
 * is charged.
 */
export function activeSalePercent(sale: SaleTerms, today: string): number {
  if (!sale.onSale) return 0;
  // ISO dates compare as strings.
  if (sale.starts && today < sale.starts) return 0;
  if (sale.ends && today > sale.ends) return 0;
  return sale.percent;
}

/**
 * A price in dollars with a percentage off, to the cent, as `sale_price()`
 * rounds it. Worked in whole cents so a half cent rounds up here as it does
 * in Postgres.
 */
export function salePrice(price: number, percent: number): number {
  return Math.round((Math.round(price * 100) * (100 - percent)) / 100) / 100;
}

/**
 * A typed-in donation in dollars, rounded to cents, or null when it isn't a
 * number between 0 and MAX_DONATION. Blank counts as no donation.
 */
export function parseDonation(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const amount = Math.round(Number(trimmed) * 100) / 100;
  return amount <= MAX_DONATION ? amount : null;
}

/** Fixture races offer every extra at the starting prices. */
export const FIXTURE_EXTRAS: EventExtras = {
  shirtPrice: SHIRT_PRICE,
  shirtShippingPrice: SHIRT_SHIPPING_PRICE,
  photoPrice: PHOTO_PRICE,
  donationRecipient: "Fundación Corre PR",
  shippingPrice: null,
  childShippingPrice: null,
};

/**
 * What the mail costs an order, in dollars: `base` is the event's shipping
 * price and `children` what the children's medals add to it.
 *
 * An adult who runs pays the shipping price for their own shipment, and the
 * price per child for each child's medal that rides in it. An adult who
 * signed up only children has no shipment of their own, so the first child
 * is covered by the shipping price and each further one pays the price per
 * child. Children's medals are mailed only where `childShippingPrice` is set:
 * elsewhere children add nothing, and an adult who is not racing has nothing
 * to mail.
 */
export function shippingCharge(opts: {
  mail: boolean;
  /** False when the adult signs up only children. */
  racing: boolean;
  children: number;
  extras: EventExtras;
}): { base: number; children: number } {
  const shipping = opts.extras.shippingPrice;
  if (!opts.mail || shipping === null) return { base: 0, children: 0 };

  const perChild = opts.extras.childShippingPrice ?? null;
  const mailed = perChild === null ? 0 : opts.children;
  if (opts.racing) return { base: shipping, children: mailed * (perChild ?? 0) };
  if (mailed === 0) return { base: 0, children: 0 };
  return { base: shipping, children: (mailed - 1) * (perChild ?? 0) };
}

/**
 * What an order's shirts cost, in dollars: `shirts` is the event's shirt
 * price for each and `shipping` its shipping price per shirt for each. Every
 * shirt is mailed, whether or not the runner takes the mail extra, so every
 * one pays its shipping.
 */
export function shirtCharge(
  count: number,
  extras: EventExtras,
): { shirts: number; shipping: number } {
  if (count <= 0 || extras.shirtPrice === null) return { shirts: 0, shipping: 0 };
  // In cents, so a price that is not exact in binary does not drift.
  const cents = (price: number) => (Math.round(price * 100) * count) / 100;
  return {
    shirts: cents(extras.shirtPrice),
    shipping: cents(extras.shirtShippingPrice ?? 0),
  };
}

/**
 * The sign-up's sales tax (0 when the event doesn't charge it) and what the
 * runner pays in all, in dollars.
 */
export function registrationTotal(opts: {
  /**
   * The adult's distance; 0 when they sign up only children. On an event on
   * sale this and `childPrice` are the prices after it (`salePrice()`).
   */
  price: number;
  extras: EventExtras;
  /** How many shirts are on the order; each also pays its shipping. */
  shirts: number;
  photos: boolean;
  donation: number;
  mail: boolean;
  /** The event charges sales tax; when it doesn't, the tax is 0. */
  salesTax: boolean;
  /** Children on the sign-up, each at the event's flat child price. */
  children?: number;
  childPrice?: number;
  /** False when the adult signs up only children. */
  racing?: boolean;
}): { tax: number; total: number } {
  const shipping = shippingCharge({
    mail: opts.mail,
    racing: opts.racing ?? true,
    children: opts.children ?? 0,
    extras: opts.extras,
  });
  const shirts = shirtCharge(opts.shirts, opts.extras);
  // In cents, so the tax rounds the way Postgres's round(x, 2) does.
  const taxable = Math.round(
    (opts.price +
      shirts.shirts +
      shirts.shipping +
      (opts.photos ? (opts.extras.photoPrice ?? 0) : 0) +
      (opts.children ?? 0) * (opts.childPrice ?? 0) +
      // Once per order, however many are on it.
      SERVICE_FEE +
      shipping.base +
      shipping.children) *
      100,
  );
  const tax = opts.salesTax ? Math.round(taxable * SALES_TAX_RATE) : 0;
  const total = taxable + tax + Math.round(opts.donation * 100);
  return { tax: tax / 100, total: total / 100 };
}
