import type { Metadata } from "next";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { getNotifications } from "@/lib/data";
import { getLocale, getT } from "@/lib/i18n/server";
import { requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("notifications.metaTitle"),
    description: t("notifications.metaDescription"),
  };
}

export default async function NotificationsPage() {
  await requireUser("/notifications");

  const locale = await getLocale();
  return <NotificationCenter initial={getNotifications(locale)} />;
}
