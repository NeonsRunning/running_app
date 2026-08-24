/**
 * Policy copy. Written as plain data so every policy page shares one layout,
 * one table of contents and one "last updated" convention.
 *
 * These are realistic drafts for a product demo, not legal advice — have
 * counsel review before this platform takes real money.
 */

import type { Locale } from "./i18n/config";
import { LEGAL_COPY_ES } from "./content/legal.es";

export type LegalDoc = {
  slug: string;
  title: string;
  summary: string;
  updated: string;
  sections: { heading: string; paragraphs: string[] }[];
};

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "terms",
    title: "Terms & Conditions",
    summary:
      "The agreement between you and Neons Running when you use the platform or enter a race through it.",
    updated: "1 June 2026",
    sections: [
      {
        heading: "1. Who we are",
        paragraphs: [
          "NEONS RUNNING is operated by Neons Running LLC, registered in San Juan, Puerto Rico. We provide the platform on which independent organizers list races and runners register for them.",
          "We are not the organizer of any race unless the event page names Neons Running PR as the organizer. For every other event, the organizer named on the listing is responsible for the race itself.",
        ],
      },
      {
        heading: "2. Your account",
        paragraphs: [
          "You must be 16 or older to hold an account. Entries for younger runners are made by a parent or guardian from their own account.",
          "Keep your credentials to yourself. You are responsible for activity on your account until you tell us it has been compromised.",
        ],
      },
      {
        heading: "3. Entering a race",
        paragraphs: [
          "A registration is a contract between you and the organizer. We collect payment on their behalf and pass on your details so they can run the event and time you.",
          "Entries are personal. Transferring a bib to another runner is only permitted where the organizer has enabled transfers on that event, and always through the platform — never privately. An untransferred bib worn by someone else voids the result and the insurance.",
          "You confirm at checkout that you are medically fit to take part, and you accept the organizer's waiver as shown during registration.",
        ],
      },
      {
        heading: "4. Fees",
        paragraphs: [
          "Runners pay a flat service fee per registration, shown in the order summary before payment. Free events carry no fee.",
          "Organizers pay nothing to list an event. Payouts are made within five business days of race day, net of refunds and chargebacks.",
        ],
      },
      {
        heading: "5. Acceptable use",
        paragraphs: [
          "Do not scrape the platform, resell entries, impersonate another runner, or submit results you did not run. We remove results obtained by course-cutting or bib-swapping and may close the account behind them.",
        ],
      },
      {
        heading: "6. Liability",
        paragraphs: [
          "Running is a physical activity with inherent risk. To the extent the law allows, Neons Running is not liable for injury, loss or damage arising from participation in an event listed on the platform.",
          "Nothing in these terms limits liability for fraud, or for anything that cannot be limited under Puerto Rico law.",
        ],
      },
      {
        heading: "7. Changes",
        paragraphs: [
          "We will give at least 30 days' notice by email before any material change to these terms takes effect. Continuing to use the platform after that date means you accept the revision.",
        ],
      },
    ],
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    summary:
      "What we collect, why we need it, who it goes to, and how to get it back or delete it.",
    updated: "1 June 2026",
    sections: [
      {
        heading: "What we collect",
        paragraphs: [
          "Account details: your name, email, phone and date of birth. Date of birth is required because age groups are calculated from it and most events have a minimum age.",
          "Registration details: the emergency contact you give us, your shirt size, your club, and anything an organizer asks in their own registration questions.",
          "Results: your official times, splits and placings. These are public by design — a race result is a published record.",
          "Technical data: pages viewed and device type, used to keep the service working and to see which features get used.",
        ],
      },
      {
        heading: "Why we need it",
        paragraphs: [
          "To take your entry and get you a bib; to let the organizer run the race safely and time you; to send race reminders and results; and to meet our tax and accounting obligations.",
          "We do not sell your data, and we do not sell your email address to sponsors.",
        ],
      },
      {
        heading: "Who it goes to",
        paragraphs: [
          "The organizer of each race you enter receives the details needed to run that event — your name, age, gender, category, shirt size and emergency contact. They may only use it for that event.",
          "Our payment processor receives what it needs to take the payment. We never store full card numbers.",
          "Timing partners receive your bib number and category so results can be matched to you.",
        ],
      },
      {
        heading: "How long we keep it",
        paragraphs: [
          "Account and registration data for as long as your account is open, then 24 months. Financial records for seven years, as required. Results stay published indefinitely, because they are a permanent sporting record — you may ask us to detach your name from them.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          "You can export everything we hold on you from your settings, and delete your account from the same screen. Deletion removes your profile and registrations; published results are anonymised rather than erased.",
          "Write to privacidad@neonsrunning.pr with any question about this policy.",
        ],
      },
    ],
  },
  {
    slug: "refunds",
    title: "Refund Policy",
    summary:
      "When you get your money back, how much of it, and how long it takes.",
    updated: "1 June 2026",
    sections: [
      {
        heading: "The standard window",
        paragraphs: [
          "Cancel more than 14 days before race day and you are refunded in full, including the service fee, automatically from your profile. No email, no form, no organizer approval.",
          "Inside 14 days, the organizer's own policy applies. It is stated on every event page before you pay — most offer a 50% refund up to 72 hours out, and nothing after that, because shirts and medals have already been ordered against your entry.",
        ],
      },
      {
        heading: "How to cancel",
        paragraphs: [
          "Open the registration on your profile and choose Cancel registration. You will see exactly what you get back before you confirm.",
        ],
      },
      {
        heading: "When the money arrives",
        paragraphs: [
          "Refunds are issued to the original payment method within one business day and typically appear in 5–10 business days, depending on your bank.",
        ],
      },
      {
        heading: "Add-ons and donations",
        paragraphs: [
          "Shirts and photo packs are refunded on the same terms as the entry. Charity donations are passed to the charity on receipt and cannot be refunded.",
        ],
      },
      {
        heading: "Injury and illness",
        paragraphs: [
          "Many organizers will defer your entry to their next edition rather than refund it, even outside the window. Contact the organizer from the event page — that conversation is between you and them.",
        ],
      },
    ],
  },
  {
    slug: "cancellation",
    title: "Event Cancellation Policy",
    summary:
      "What happens to your entry when the organizer cancels, postpones or shortens a race.",
    updated: "1 June 2026",
    sections: [
      {
        heading: "If a race is cancelled",
        paragraphs: [
          "Every entry is refunded in full, including the service fee, within one business day of the cancellation being published. You are notified by email and in the app.",
          "Add-ons are refunded with the entry. Donations already passed to the charity are not.",
        ],
      },
      {
        heading: "If a race is postponed",
        paragraphs: [
          "Your entry moves to the new date automatically and your bib number is preserved. If the new date does not suit you, you have 14 days from the announcement to request a full refund from your profile.",
        ],
      },
      {
        heading: "Weather and safety",
        paragraphs: [
          "Tropical storms, lightning, and heat above the organizer's stated threshold can shorten a course or move a start time at short notice. A race that starts and is then stopped for safety counts as run, and is not refunded — the organizer has already incurred the cost.",
          "Course changes of less than 20% of the advertised distance do not trigger a refund.",
        ],
      },
      {
        heading: "Organizer obligations",
        paragraphs: [
          "Organizers must publish a cancellation within two hours of the decision and notify every registered runner through the platform. Repeated late cancellation is grounds for removing an organizer from NEONS RUNNING.",
        ],
      },
    ],
  },
  {
    slug: "organizer-terms",
    title: "Organizer Terms",
    summary:
      "What you agree to when you publish a race on NEONS RUNNING, and what we owe you.",
    updated: "1 June 2026",
    sections: [
      {
        heading: "Listing an event",
        paragraphs: [
          "Listing is free. You keep every entry fee; runners pay the flat service fee at checkout.",
          "Your listing must be accurate about distance, date, start time, course surface, cutoff and what an entry includes. Material changes must be published to registered runners through the platform, not only on social media.",
        ],
      },
      {
        heading: "Your responsibilities",
        paragraphs: [
          "You are the organizer of your event. Permits, road closures, marshals, medical cover, insurance and the safety of the course are yours, not ours.",
          "You must hold public liability insurance appropriate to the field size, and be able to show it on request.",
        ],
      },
      {
        heading: "Runner data",
        paragraphs: [
          "You receive participant data to run the event and time it. You may not use it for marketing unrelated to that event, sell it, or retain it beyond 24 months after race day.",
        ],
      },
      {
        heading: "Payouts",
        paragraphs: [
          "Funds settle within five business days of race day, net of refunds, chargebacks and any donations owed to a named charity. Partial early payouts are available for events with over 300 entries — ask support.",
        ],
      },
      {
        heading: "Results",
        paragraphs: [
          "Post official results within 48 hours of the finish. Results published on NEONS RUNNING become part of each runner's permanent profile, so corrections must be made through the platform rather than by re-uploading a file.",
        ],
      },
      {
        heading: "Removal",
        paragraphs: [
          "We may remove a listing that is inaccurate, unsafe, or repeatedly cancelled, and we will refund every affected entry if we do.",
        ],
      },
    ],
  },
];

/**
 * Layer the requested locale's copy over the base document. Sections are
 * matched on their English heading, so a base section with no translation
 * falls through as written rather than dropping out of the page.
 */
function localizeDoc(doc: LegalDoc, locale: Locale): LegalDoc {
  const copy = locale === "es" ? LEGAL_COPY_ES[doc.slug] : undefined;
  if (!copy) return doc;

  return {
    ...doc,
    title: copy.title,
    summary: copy.summary,
    updated: copy.updated,
    sections: doc.sections.map((section) => copy.sections[section.heading] ?? section),
  };
}

/** Slugs are locale-independent, so route generation needs no locale. */
export function getLegalSlugs(): string[] {
  return LEGAL_DOCS.map((d) => d.slug);
}

export function getLegalDocs(locale: Locale): LegalDoc[] {
  return LEGAL_DOCS.map((doc) => localizeDoc(doc, locale));
}

export function getLegalDoc(slug: string, locale: Locale): LegalDoc | undefined {
  const doc = LEGAL_DOCS.find((d) => d.slug === slug);
  return doc && localizeDoc(doc, locale);
}
