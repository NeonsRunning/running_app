# NEONS RUNNING

A race-discovery, registration and results platform for the Caribbean running
community — built with Next.js 16 (App Router), React 19 and Tailwind CSS v4.

```bash
npm install
npm run dev         # http://localhost:3000
npm run build       # production build (Turbopack)
npm run lint
npm run check:i18n  # dictionaries against each other and against the source
```

## What is here

Twelve production-quality screens plus the supporting pages, all wired to one
another so the app reads as a working product rather than a set of mockups.

| Screen | Route |
| --- | --- |
| Landing | `/` |
| Event discovery (filters, sort, list/map) | `/events` |
| Event details | `/events/[slug]` |
| Registration flow (5 steps + confirmation) | `/events/[slug]/register` |
| Runner profile — public, and your own races and settings when it is yours | `/runners/[id]`, `/runners/me` |
| Publish event wizard (7 steps) | `/publish` |
| Organizer dashboard (with charts) | `/organizer` |
| Participant management | `/organizer/participants` |
| Race-day check-in | `/organizer/checkin` |
| Results leaderboard / result detail | `/events/[slug]/results[/bib]` |
| Authentication | `/login`, `/signup`, `/forgot-password`, `/verify-email`, `/reset-password` |

Secondary: `/community`, `/notifications`, `/results`, `/about`,
`/contact`, `/faq`, `/legal/[doc]`, plus 404, error and loading states.

## Structure

```
app/[lang]/
  (site)/     browsable pages — header, footer, mobile tab bar
  (flow)/     focused flows — registration, publish, check-in (no site chrome)
  (auth)/     split-screen auth pages
  auth/       OAuth callback and email-confirmation route handlers
components/
  ui/         the design system (button, field, tabs, modal, toast, table…)
  brand/      logo, wordmark, tagline
  events/     event cards, discovery, detail tabs, favourites
  organizer/  charts, participant table, check-in station
  i18n/       locale provider, localized <Link>, language switcher
  …
lib/
  data.ts     typed in-memory fixtures + accessors
  types.ts    domain types
  profile/    the profile tables: reads and server actions
  pr-municipalities.ts  the 78 municipalities, the city vocabulary
  legal.ts    policy copy
  i18n/       locale rules, dictionary loading, formatters
  content/    per-locale copy layered over the fixtures
dictionaries/ es.json (the key set) and en.json
supabase/     SQL migrations
middleware.ts locale routing and Supabase token refresh
```

`lib/data.ts` is the only data source. Every page reads through the accessors at
the bottom of that file, so replacing the fixtures with a real API is a
one-layer change.

## Design system

Tokens live in `app/globals.css` under `@theme` — surfaces, hairlines, the neon
ramp, type and motion. Components consume them through Tailwind utilities
(`bg-ink`, `text-neon-lime`, `border-line`).

**Neon is an accent, not a surface.** Yellow `#FFF200`, lime `#9CFF00` and green
`#49FF18` are reserved for primary actions, active states, and the one or two
figures that matter most on a screen. Everything else is near-black and white.

Brand textures are custom utilities: `bg-road-lines`, `bg-track-lanes`,
`bg-grid-map`, `bg-cover-wash`, `bg-finish-line`, `text-gradient-neon`.

### The logo

`components/brand/logo.tsx` serves the supplied artwork in two cuts, both
exported as premultiplied glow on transparency so they sit on any of the dark
surfaces without a black plate behind them:

- `NeonsMark` — the full badge (`public/brand/neons-running.png`): ring,
  runners, wordmark, tagline. It carries its own type, so give it ~56px or more.
  Used standalone on the about header and the 404.
- `NeonsEmblem` — the winged N alone (`public/brand/neons-mark.png`), which
  stays legible small. It is the mark in `BrandLock` (header, auth, publish) and
  in the footer lockup, paired with the text `NeonsWordmark`. The wings make it
  a wide mark, roughly 2.7:1, and the file is cut to that ratio rather than to a
  square, so it takes a `height` and works its width out from there.

`app/icon.png` and `app/apple-icon.png` are the same emblem centred on a square
— which is what an icon has to be — so the browser tab matches the header.
Regenerate any of them from the source artwork with `scripts/brand-assets.py`.

### Chart colours

The organizer charts follow one rule worth keeping: **the brand's lime and
yellow are never used to separate two data series.** They are indistinguishable
to protanopes (ΔE 0.4) and marginal even with full colour vision. Single-series
charts use a brand neon; the two-series demographics chart uses a validated pair
(`#61A400` / `#3D82F0`, ΔE 30.4 protan) and ships a legend plus direct labels.
Every chart also has a table view.

## Languages

Spanish and English. Spanish is the default and sits at the root of the URL
space (`/events`); English is prefixed (`/en/events`). Every route lives under
`app/[lang]` and `middleware.ts` rewrites the unprefixed paths onto it, so the
address bar stays clean and `/es/events` redirects to the canonical `/events`.

The locale is decided by the path alone — nothing sniffed, nothing negotiated.
Every URL stays cacheable, and a shared link opens in the language it was
written in.

```
lib/i18n/config.ts     locales and the prefix rule (localizePath / splitLocale)
lib/i18n/server.ts     getLocale, getDictionary, getT for server components
lib/i18n/translate.ts  the translator both sides share
lib/i18n/format.ts     dates, clocks, money and distances per locale
lib/i18n/labels.ts     domain vocabulary — distances, event types, waves
components/i18n/       provider, useT, useFormat, the localized Link
dictionaries/          es.json and en.json
lib/content/*.es.ts    Spanish copy for the fixtures
```

Server components call `getT()`, which reads the locale from
`next/root-params`, so it never has to be threaded through props. Client
components read the same dictionary through `useT()`, from a provider the root
layout seeds once. Links are written as plain app paths (`/events`) and
prefixed by `components/i18n/link.tsx`, which is the only place that knows the
default locale is unprefixed.

`dictionaries/es.json` defines the key set: `lib/i18n/types.ts` derives the
`Dictionary` type from it, so a key missing from `en.json` fails the build
rather than rendering as a blank label. `npm run check:i18n` covers the three
things the type checker cannot see — keys present in one locale only, a `t()`
call with no dictionary entry, and entries nothing references any more.

Copy that belongs to the data rather than the interface — event descriptions,
schedules, aid stations, policy text — lives in `lib/content/` as a per-locale
layer keyed by stable identifiers (a schedule row by its clock time, an aid
station by its kilometre), the same split a localized CMS uses. Reordering a
fixture therefore cannot silently mismatch its translation.

## Authentication

Supabase, wired through `@supabase/ssr` so the session lives in cookies and is
readable on the server. Sign-in, sign-up and password recovery all post to
server actions in `lib/auth/actions.ts`, so credentials never enter client
state and the forms work before React hydrates.

```
lib/supabase/env.ts      credentials, read in one place
lib/supabase/client.ts   browser client
lib/supabase/server.ts   server components, actions, route handlers
lib/supabase/proxy.ts    token refresh for middleware
lib/auth/actions.ts      sign in / sign up / recover / sign out
lib/auth/session.ts      getUser, requireAccount, the Session the UI renders
lib/auth/routes.ts       which paths need a session
lib/auth/errors.ts       Supabase error codes -> dictionary keys
lib/profile/queries.ts   reading profiles
lib/profile/actions.ts   editing a profile, switching on the organizer tools
lib/profile/view.ts      one runner page shape, from a profile or a fixture
```

Two rules hold everywhere:

- **Authorization always hangs off `getUser()`, never `getSession()`.** The
  former revalidates the token with Supabase; the latter trusts a cookie the
  browser could have rewritten. The middleware gate is an optimisation — pages
  that read account data call `requireUser()` as well.
- **Errors are keys, not sentences.** Supabase answers in English; the app
  speaks Spanish first. Actions return keys like `invalidCredentials`, and the
  form translates them against `auth.errors`.

### Project setup

Copy `.env.example` to `.env.local` and fill it in, then in the Supabase
dashboard:

1. **Authentication → URL Configuration → Redirect URLs.** Add every origin the
   app is served from, with a wildcard path — `http://localhost:3000/**` and
   `https://your-domain.com/**`. Links in confirmation and recovery emails are
   refused unless their destination matches, and a mismatch shows up as a dead
   link rather than an error.
2. **Authentication → Providers → Google** (optional). The sign-in screen shows
   the Google button regardless; the flow only completes once the provider is
   enabled and the callback `https://<project>.supabase.co/auth/v1/callback` is
   registered with Google.

Email templates need no changes. `app/[lang]/auth/confirm` accepts both the
stock `{{ .ConfirmationURL }}` link and a `{{ .TokenHash }}` one — switching
the templates to the latter is worth doing anyway, because a token hash is
verified straight against Supabase and so survives being opened in a different
browser from the one that asked for the reset.

### Flows

| Flow | Path through the code |
| --- | --- |
| Sign in | `signInAction` → `signInWithPassword` → `?next=` or `/runners/me` |
| Sign up | `signUpAction` → `/verify-email` → the emailed link → `/auth/confirm` |
| Recovery | `requestPasswordResetAction` → email → `/auth/confirm` → `/reset-password` → `updatePasswordAction` |
| Google | `signInWithGoogleAction` → provider → `/auth/callback` |

Sign-up puts `full_name` on the user's metadata, where the `handle_new_user`
trigger reads it to seed the profile row that `toSession()` projects onto the
header and the profile's settings. The account type is the trigger's to set — always
`runner` — and settings can promote a runner to an organizer later.

Neither the sign-up form nor the recovery form will tell a stranger whether an
address is registered. Sign-up shows the same inbox screen either way (Supabase
returns a decoy user, detectable only by an empty `identities` array), and
recovery reports success on every failure except a rate limit — which describes
the sender, not the account.

## Database

One table so far, in two halves.

```
supabase/migrations/  the schema, in order
lib/supabase/database.types.ts  the schema as TypeScript sees it
```

`auth.users` belongs to Supabase: it takes no extra columns and is reachable
only through the auth API. Everything the app renders about a person lives in
`public.profiles` instead, keyed one-to-one on the user id — the name on a bib,
the handle a runner picks, the city, the club, the bio, and `account_type`,
which is what every organizer-only screen reads.

| Table | Holds | Who can read it |
| --- | --- | --- |
| `public.profiles` | handle, name, account type, avatar, bio, city, club, visibility | anyone, for public rows; always its owner |
| `public.profile_private` | birth date, gender, shirt size, phone, emergency contact, email language | its owner, and no one else |

**The split is a privacy boundary.** Row-level security filters rows, never
columns, so a table a stranger may read cannot also hold a phone number: any
policy wide enough to show a public profile would show the whole row.

Two more things the database does rather than the app:

- **Every user gets a profile.** `handle_new_user` fires on insert into
  `auth.users` and writes both rows, deriving a unique handle from the name
  (`Ana Muñoz` → `ana-munoz`, then `ana-munoz2`). Password sign-up and Google
  both go through it, and it always writes `account_type = 'runner'`, so a
  hand-crafted sign-up post cannot ask for the organizer tools.
- **Writes are scoped to the owner.** The update policies match `auth.uid()`
  against the row id, so the worst a forged server-action POST can do is edit
  its own sender's profile.

### Applying it

With the Supabase CLI, against the linked project:

```bash
npx supabase link --project-ref <ref>
npm run db:push     # supabase db push
npm run db:types    # regenerate database.types.ts from the live schema
```

Or paste `supabase/migrations/20260824120000_profiles.sql` into the SQL editor
in the dashboard. It is idempotent in the part that matters: accounts that
existed before it ran are backfilled at the end.

### Changing a SQL function

Migrations are append-only, so a function changed several times lives in full
in every migration that changed it, and only the last one counts. To change
one, copy **its latest definition** into a new migration and edit that:
copying an older one silently drops whatever was added since.

```bash
npm run db:functions               # every function and the migration that defines it now
npm run db:functions save_event    # just one
```

Prices are worked out twice, in `register_for_event()` (what is charged) and
`lib/events/pricing.ts` (what the form shows). `supabase/tests/database/pricing.test.sql`
and `lib/events/pricing.test.ts` price the same sign-up; change the fee or the
tax rate in both places, or one of them fails.

### Testing it

`npm run test:db` runs the pgTAP tests in `supabase/tests` against a local
database (`supabase start`, which needs Docker); CI runs them on every pull
request, after applying every migration to a fresh database. They insert
test users and events inside a transaction they roll back — run them only
against a throwaway database, never a real project's SQL editor.

## ATH Móvil payments

Next to Stripe, runners can pay with ATH Móvil. There is no API behind it: the
money goes to the platform's ATH Móvil Business account and the event's
organizer confirms each payment by hand.

```
lib/ath-movil/config.ts              path, QR, payment code
lib/ath-movil/review.ts              approve / reject (server action)
components/register/ath-movil-payment.tsx  instructions and "under review" screen
components/organizer/event-payments.tsx    the organizer's table on the event page
app/[lang]/(site)/admin/payments     the admins' cross-event queue
supabase/migrations/20261026120000_ath_movil_payments.sql
supabase/migrations/20261027120000_organizer_payment_review.sql
```

1. **Pay.** The payment step shows the QR code, the business path, the exact
   amount and a short code (`NR-3F9A1C`) for the payment message. The runner
   sends the money, types in the reference from their ATH Móvil receipt and
   taps "I’ve sent the payment".
2. **Wait.** `submit_ath_movil_payment()` holds the spot until it is reviewed
   (`hold_expires_at = 'infinity'`, so every capacity check counts it). The
   runner is told to allow up to 48 hours; the register page reopens on the
   "payment under review" screen.
3. **Review.** The event's organizer sees a **Pending payments** table on the
   event page (`/events/[slug]`; nobody else does). They find each payment in
   the ATH Móvil Business app and confirm it — the bib is assigned and the
   usual confirmation email goes out — or reject it, which releases the spot
   and lets the runner pay again. Card payments never appear there: Stripe
   confirms them. Platform admins can review any event's payments from
   **Payment Review** in the account menu (`/admin/payments`).

Payments go to an ATH Móvil Business account chosen per event. Platform
admins list the accounts — a name, the business path and the QR code exported
from the ATH Móvil Business app — at `/admin/payments/accounts`, and organizers
pick one in the **Registration** step of the publish wizard. An event with no
account (or a retired one) takes cards only. Each submission records the
account it went to, so reviewers know which business app to check even if the
event switches accounts later. Platform admins are granted in the SQL editor:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'someone@example.com';
```

A card payment that lands for a sign-up whose ATH Móvil payment is already
under review is refunded automatically.

## Email

Transactional email goes through Brevo's API. Set `BREVO_API_KEY` and
`BREVO_SENDER_EMAIL` (a sender verified in Brevo) to turn it on; without them
nothing is sent and everything else works as before.

| Email | Sent to | When |
| --- | --- | --- |
| `registration-confirmed` | Runner | A payment confirms their sign-up (card, or an approved ATH Móvil payment) |
| `ath-movil-rejected` | Runner | Their ATH Móvil payment is rejected |
| `payment-refunded` | Runner | A card payment is refunded because it could not become a registration |
| `registration-changed` | Runner | Their sign-up is removed, or an ATH Móvil confirmation is undone |
| `result-reviewed` | Runner | Their finish time is accepted or sent back |
| `race-reminder` | Runner | The day before the race (see below) |
| `kit-shipped` | Runner | The organizer marks their mailed kit shipped (tracking number optional) |
| `review-requested` | Organizer | A runner sends an ATH Móvil payment or a finish time to review |
| `event-removed` | Organizer | An admin removes their event, with the reason |
| `event-cancelled` | Runners | An admin removes a race not yet run |
| `event-restored` | Organizer, runners | An admin restores it (runners only if still to come) |
| `event-updated` | Organizer, runners | An admin edits their event; a race-day date, time or place changes |
| `contact-message` | Team inbox | The contact form is sent (`CONTACT_EMAIL`, else the Brevo sender; Reply-To is the visitor) |

```
lib/email/brevo.ts      the API call, one email or many
lib/email/layout.ts     the shared HTML and plain-text frame
lib/email/recipient.ts  addresses and languages, read with the service role
lib/email/*.ts          one module per email: who, what, when
```

- **Never in the way.** Emails go out with `after()`, once the response is
  sent, and a Brevo failure is logged rather than failing the action.
- **Sent once.** The confirmation, the reminder and the kit-shipped email
  claim their registration first (`confirmation_email_sent_at`,
  `reminder_email_sent_at`, `shipping_email_sent_at`); a failed
  send clears the claim so a later attempt retries. A refund emails only when
  Stripe actually created it, not on an idempotent replay.
- **In the reader's language.** Each email reads `profile_private.locale` for
  its recipient. Copy lives under `emails.*` in the dictionaries.

### Scheduled jobs

Two routes need calling on a schedule, each with
`Authorization: Bearer $CRON_SECRET` (set `CRON_SECRET`; without it both
refuse every call):

- `GET /api/cron/race-reminders` — **hourly.** Emails every confirmed runner
  of a race that starts tomorrow (Puerto Rico time), except those who switched
  reminders off. A run sends what it has time for; later runs that day pick up
  the rest and retry failures, and nobody is reminded twice.
- `GET /api/cron/email-outbox` — **every 10 minutes.** Notices that go to a
  whole race (date or place changed, cancelled, reinstated) are written to
  `email_outbox` and sent from there; this finishes what the original request
  did not and retries failures, up to 8 tries. Rows that gave up keep their
  `last_error`: `select * from email_outbox where sent_at is null and attempts >= 8`.
  A send that timed out waiting for Brevo is not retried — Brevo may well
  have sent it, and a runner told twice is worse than a row to check — so it
  is among those rows too, with a `last_error` starting "Unconfirmed".

On Vercel, the `vercel.json` at the root of the repository holds both cron
entries, and Vercel sends the header by itself:

```json
{
  "crons": [
    { "path": "/api/cron/race-reminders", "schedule": "5 * * * *" },
    { "path": "/api/cron/email-outbox", "schedule": "*/10 * * * *" }
  ]
}
```

Both schedules run more than once a day, which needs a Vercel Pro (or
Enterprise) plan: on Hobby, cron jobs may run at most once a day and a
deployment with these entries is refused. On Hobby, call the routes from
another scheduler instead, with the same header.

The database schedules its own clean-ups with `pg_cron`: abandoned checkouts
hourly, sent outbox rows after 30 days, rate-limit counters after 2 days.

### Watching for failures

There is no monitoring service; failures go to the hosting platform's logs.
The ones someone has to act on are written by `logCritical` (`lib/log.ts`) as
one line starting with `CRITICAL` followed by JSON, so a single search finds
them all and a log drain or alert can match on them:

```
CRITICAL {"code":"REFUND_FAILED","message":"A refund failed; the runner is still charged.","paymentIntent":"pi_…"}
```

| Code | What to do |
|---|---|
| `REFUND_FAILED` | Stripe is retrying through the webhook; if it keeps failing, refund the PaymentIntent by hand. |
| `PAYMENT_DISPUTED` | Answer the dispute in the Stripe dashboard before its deadline. |
| `EMAIL_GAVE_UP` | An outbox email failed 8 times; its row in `email_outbox` has the error. |
| `EMAIL_UNCONFIRMED` | Brevo did not answer an outbox send in time. Look the address up in Brevo's logs; resend only if it is not there. |
| `EMAIL_NOT_MARKED_SENT` | An outbox email went but its row was not marked; set its `sent_at` by hand, or it goes again in 15 minutes. |
| `DELETION_REQUEST_NOT_EMAILED` / `DELETION_CANCELLATION_NOT_EMAILED` | Check `account_deletion_requests` and tell the team by hand. |
| `RATE_LIMIT_UNAVAILABLE` | The database could not count rate limits; calls are being let through. |
| `SITE_URL_MISSING` | Set `NEXT_PUBLIC_SITE_URL` in production. |

Log lines carry ids, never names, email addresses or phone numbers.

### Rate limits

Server actions that cost something per call are throttled through
`hit_rate_limit()` (`lib/rate-limit.ts`): contact messages (5 an hour per IP,
3 per address), confirmation and password-reset emails (10 an hour per IP, 5
per address), checkouts (30 an hour per account), deletion requests (5 a day)
and data exports (10 an hour). Keys are hashed before they are stored. The
caller's IP comes from `x-forwarded-for`, which Vercel sets; behind another
proxy, make sure it overwrites that header rather than appending to it.

## Accessibility

- Visible `:focus-visible` ring on every interactive element; skip-to-content link.
- Real semantics: `role="tablist"` with arrow-key navigation, `aria-pressed` on
  toggles, `aria-current` on active nav, `role="dialog"` with focus trap and
  restore, polite live region for toasts.
- Form errors are announced (`role="alert"`, `aria-invalid`, `aria-describedby`),
  not signalled by colour alone.
- All motion is disabled under `prefers-reduced-motion`.
- Inputs are 16px on small screens so iOS does not zoom on focus.

## Responsive behaviour

Layouts are reorganised per breakpoint rather than scaled down: event rows become
stacked cards, the nine-column participant table becomes a card list, filters
move into a drawer, and event pages gain a sticky registration bar above the
persistent bottom tab bar.

## Notes

- Data is in-memory; nothing persists across a reload, and no payment is taken.
- Every screen ships in both languages; `npm run check:i18n` keeps them level.
- Policy pages in `lib/legal.ts` are realistic drafts for a demo, not legal advice.
- Accounts and profiles are real (Supabase); event, result and registration data
  is still the in-memory fixture set in `lib/data.ts`.
- `/runners/[id]` resolves both: a uuid reads `public.profiles`, anything else
  falls back to a fixture, so the demo links keep working. A real account has no
  races behind it yet, so its stats read zero and the achievement, history and
  sidebar panels show empty states rather than borrowing fixture numbers.
- `/runners/me` is the same page under the one address that can be linked to
  before an id is known — the nav, the login redirect and the confirmation
  emails all need it. It resolves against the session and renders in place, so
  a signed-out visitor is sent to login rather than to a 404. Ownership adds to
  the page rather than replacing it: saved races and recommendations appear
  only for the runner themselves, and everything above them reads the same to
  everyone.
