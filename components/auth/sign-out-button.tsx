"use client";

import type { ComponentProps } from "react";
import { useLocale } from "@/components/i18n/provider";
import { signOutAction } from "@/lib/auth/actions";

/**
 * Sign out, as a form rather than a click handler.
 *
 * Clearing the session means clearing http-only cookies, which only the
 * server can do. The wrapper is `display: contents` so the button keeps the
 * position its parent menu gave it.
 */
export function SignOutButton({
  children,
  ...rest
}: Omit<ComponentProps<"button">, "type">) {
  const locale = useLocale();

  return (
    <form action={signOutAction} className="contents">
      <input type="hidden" name="locale" value={locale} />
      <button type="submit" {...rest}>
        {children}
      </button>
    </form>
  );
}
