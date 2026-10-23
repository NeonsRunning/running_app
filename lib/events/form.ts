import type { Difficulty, Distance, EventType } from "@/lib/types";
import type { Country, ShirtSize } from "./vocabulary";

/**
 * The publish wizard's values, as strings the way the inputs hold them.
 *
 * A new event starts from `EMPTY_EVENT_FORM`; editing one starts from the
 * stored row, mapped by `toEventForm` in `lib/events/organizer.ts`. Shared by
 * the server (to build it) and the wizard (to render it), so nothing here may
 * import server code.
 */
export type EventFormCategory = {
  /** The stored row's id; null for a category added in this session. */
  id: string | null;
  distance: Distance;
  km: string;
  price: string;
  capacity: string;
  start: string;
  /** Runners already signed up — a floor for the cap, and a lock on removal. */
  registered: number;
};

export type EventFormValues = {
  /** Null until the first save. */
  id: string | null;
  status: "draft" | "published";
  slug: string | null;
  name: string;
  description: string;
  type: EventType;
  eventDate: string;
  /** Last day of a multi-day race; empty for a one-day one. */
  endDate: string;
  startTime: string;
  registrationOpens: string;
  registrationCloses: string;
  /** Runners take part anywhere in the region: no venue, address or city. */
  anywhere: boolean;
  venue: string;
  address: string;
  city: string;
  region: string;
  postalCode: string;
  country: Country;
  capacity: string;
  minimumAge: string;
  maximumAge: string;
  shirtSizes: ShirtSize[];
  /** Extras: each can be switched off without losing its price or sizes. */
  offersShirt: boolean;
  shirtPrice: string;
  offersPhotos: boolean;
  photoPrice: string;
  acceptsDonations: boolean;
  /** Who receives the donations, shown to runners beside the amounts. */
  donationRecipient: string;
  offersMail: boolean;
  /** Shipping and handling, added at the end of the runner's total. */
  shippingPrice: string;
  terrain: string;
  difficulty: Difficulty;
  elevationGain: string;
  cutoff: string;
  /** One "km — offers" line per station, as typed. */
  aidStations: string;
  /** One "time — what happens" line per item, as typed. */
  schedule: string;
  parking: string;
  directions: string;
  /** Path of the cover image in the event-images bucket; empty for none. */
  imagePath: string;
  /** Path of the route map image in the same bucket; empty for none. */
  routeImagePath: string;
  /** Path of the finisher medal image in the same bucket; empty for none. */
  medalImagePath: string;
  /** The ATH Móvil account runners pay into; empty to not offer ATH Móvil. */
  athMovilAccountId: string;
  categories: EventFormCategory[];
};

export const EMPTY_EVENT_FORM: EventFormValues = {
  id: null,
  status: "draft",
  slug: null,
  name: "",
  description: "",
  type: "Road Race",
  eventDate: "",
  endDate: "",
  startTime: "",
  registrationOpens: "",
  registrationCloses: "",
  anywhere: false,
  venue: "",
  address: "",
  city: "",
  region: "Puerto Rico",
  postalCode: "",
  country: "PR",
  capacity: "",
  minimumAge: "14",
  maximumAge: "",
  shirtSizes: ["S", "M", "L", "XL"],
  offersShirt: true,
  shirtPrice: "22",
  offersPhotos: false,
  photoPrice: "12",
  acceptsDonations: false,
  donationRecipient: "",
  offersMail: false,
  shippingPrice: "8",
  terrain: "",
  difficulty: "Moderate",
  elevationGain: "",
  cutoff: "",
  aidStations: "",
  schedule: "",
  parking: "",
  directions: "",
  imagePath: "",
  routeImagePath: "",
  medalImagePath: "",
  athMovilAccountId: "",
  categories: [
    { id: null, distance: "5K", km: "5", price: "", capacity: "", start: "", registered: 0 },
    { id: null, distance: "10K", km: "10", price: "", capacity: "", start: "", registered: 0 },
  ],
};
