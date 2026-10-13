import type { EventExtras } from "@/lib/types";

/**
 * What a registration costs on top of the category price.
 *
 * Each event sets its own extras in the publish wizard; the shirt and photo
 * prices here are the starting values a new event gets, and what fixture
 * races charge. The registration flow uses these to show a running total; the
 * amount that is stored is computed again by `register_for_event()` in
 * `20261017120000_registration_payments.sql`, which repeats the service fee. Change it
 * in both places.
 */
export const SHIRT_PRICE = 22;
export const PHOTO_PRICE = 12;
export const SERVICE_FEE = 2.9;
export const DONATIONS = [0, 5, 10, 25] as const;
/** Largest donation a runner can type in; `register_for_event()` enforces it too. */
export const MAX_DONATION = 1000;

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
  photoPrice: PHOTO_PRICE,
  donationRecipient: "Fundación Corre PR",
};

export function registrationTotal(opts: {
  price: number;
  extras: EventExtras;
  shirt: boolean;
  photos: boolean;
  donation: number;
}): number {
  return (
    opts.price +
    (opts.shirt ? (opts.extras.shirtPrice ?? 0) : 0) +
    (opts.photos ? (opts.extras.photoPrice ?? 0) : 0) +
    opts.donation +
    SERVICE_FEE
  );
}
