import type { Metadata } from "next";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";
import { NOINDEX } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("notifications.metaTitle"),
    description: t("notifications.metaDescription"),
    robots: NOINDEX,
  };
}

export default async function NotificationsPage() {
  await requireUser("/notifications");

  // Nothing stores notifications yet, so there are none to show: the sample
  // set that stood in here told real runners they held bibs they did not.
  return <NotificationCenter initial={[]} />;
}
