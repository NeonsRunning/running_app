import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  RegistrationFlow,
  type Runner,
} from "@/components/register/registration-flow";
import { requireAccount } from "@/lib/auth/session";
import { reconcilePendingPayment } from "@/lib/events/payments";
import {
  findEvent,
  getAthMovilStatus,
  getOwnRegistration,
} from "@/lib/events/queries";
import { localizePath } from "@/lib/i18n/config";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatMailingAddress } from "@/lib/profile/address";
import { getProfileDetails } from "@/lib/profile/queries";
import { getOwnFinish } from "@/lib/results/queries";

// No `generateStaticParams`: events published from /publish are read with the
// visitor's session client, which a statically generated route cannot use.

export async function generateMetadata(
  props: PageProps<"/[lang]/events/[slug]/register">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getT();

  const found = await findEvent(slug, locale);
  return {
    title: found
      ? t("register.metaTitle", { event: found.event.name })
      : t("register.metaTitleFallback"),
  };
}

const GENDER = { f: "female", m: "male", x: "other" } as const;

export default async function RegisterPage(
  props: PageProps<"/[lang]/events/[slug]/register">,
) {
  const { slug } = await props.params;
  const locale = await getLocale();

  const found = await findEvent(slug, locale);
  if (!found) notFound();
  const { event } = found;

  // Nobody can sign up before registration opens; send a typed-in URL back to
  // the race page, which says when it does.
  if (event.registrationStatus === "opening-soon")
    redirect(localizePath(`/events/${slug}`, locale));

  // Fixture races keep the demo flow, open to anyone.
  if (!event.bookable) return <RegistrationFlow event={event} />;

  // A real sign-up belongs to an account.
  const { user, profile } = await requireAccount(`/events/${slug}/register`);
  // Back from a payment that redirected, or one the payment step never heard
  // back about: confirm it first, so the page opens on the bib.
  await reconcilePendingPayment(user.id, event.id);
  const [details, existing, athMovil, finishSeconds] = await Promise.all([
    getProfileDetails(user.id),
    getOwnRegistration(user.id, event.id),
    getAthMovilStatus(user.id, event.id),
    getOwnFinish(user.id, event.id),
  ]);

  // Open with what the runner already told us; they can change any of it.
  const [firstName = "", ...rest] = (profile?.name ?? "").split(/\s+/);
  const runner: Runner = {
    firstName,
    lastName: rest.join(" "),
    email: user.email ?? "",
    phone: details?.phone ?? "",
    dob: details?.birthDate ?? "",
    gender: details?.gender ? GENDER[details.gender] : "undisclosed",
    emergencyName: details?.emergencyContactName ?? "",
    emergencyPhone: details?.emergencyContactPhone ?? "",
    club: profile?.club ?? "",
  };

  return (
    <RegistrationFlow
      event={event}
      initialRunner={runner}
      initialShirtSize={details?.shirtSize ?? null}
      initialMailingAddress={
        details?.mailingAddress
          ? formatMailingAddress(details.mailingAddress)
          : ""
      }
      existing={existing}
      finishSeconds={existing ? finishSeconds : null}
      athMovil={athMovil}
    />
  );
}
