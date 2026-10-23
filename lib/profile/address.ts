/**
 * The runner's mailing address: where a medal goes when they pick "send by
 * mail" at registration.
 *
 * A US postal address, Puerto Rico included. It lives on `profile_private` in
 * parts, and is flattened by `formatMailingAddress` into the single text the
 * registration stores — a snapshot, so a later edit here never redirects a kit
 * that is already in the mail.
 */

export type MailingAddress = {
  line1: string;
  line2: string | null;
  city: string;
  /** Two-letter USPS code, one of `US_STATES`. */
  state: string;
  postalCode: string;
};

export const ADDRESS_LIMITS = { line: 100, city: 80 } as const;

/** The pattern `profile_private.address_postal_code` checks. */
export const POSTAL_CODE = /^\d{5}(-\d{4})?$/;

/** Where most runners live, so an empty form opens on it. */
export const DEFAULT_STATE = "PR";

/**
 * USPS codes for the states, DC and the territories, Puerto Rico first.
 * Proper nouns, so they read the same in both locales and are never routed
 * through the dictionary.
 */
export const US_STATES = [
  ["PR", "Puerto Rico"],
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AS", "American Samoa"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["GU", "Guam"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["MP", "Northern Mariana Islands"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["VI", "U.S. Virgin Islands"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
] as const;

export function isStateCode(code: string): boolean {
  return US_STATES.some(([c]) => c === code);
}

/**
 * The address as an envelope prints it:
 *
 *     123 Calle Luna, Apt 4B
 *     San Juan, PR 00901
 */
export function formatMailingAddress(address: MailingAddress): string {
  const street = [address.line1, address.line2].filter(Boolean).join(", ");
  return `${street}\n${address.city}, ${address.state} ${address.postalCode}`;
}
