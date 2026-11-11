"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useRef,
  useTransition,
  type ComponentProps,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Link } from "@/components/i18n/link";
import { useLocale, useT } from "@/components/i18n/provider";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { localizePath } from "@/lib/i18n/config";

/**
 * How `/admin/payments/history` changes its filters, order and page.
 *
 * Every change is a navigation to the same page with new search params, and
 * the server reads the database again. Run inside one transition, so while
 * the server works the page can say so: the results dim, a bar runs along
 * their top and the Apply button reads "Applying…". Without JavaScript the
 * form and links still work, as plain GET requests.
 */

type Nav = {
  pending: boolean;
  /** Go to an app path (no locale prefix), keeping the scroll position. */
  go: (href: string) => void;
  results: React.RefObject<HTMLDivElement | null>;
};

const NavContext = createContext<Nav | null>(null);

function useNav(): Nav {
  const nav = use(NavContext);
  if (!nav) throw new Error("Payment history controls need <PaymentHistoryNav>.");
  return nav;
}

/** A click the browser should handle itself: a new tab, a new window. */
function isModified(e: MouseEvent) {
  return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
}

export function PaymentHistoryNav({ children }: { children: ReactNode }) {
  const router = useRouter();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const results = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (href: string) =>
      startTransition(() => {
        router.push(localizePath(href, locale), { scroll: false });
      }),
    [router, locale],
  );

  return <NavContext value={{ pending, go, results }}>{children}</NavContext>;
}

/** A link inside the page — a sort header, say — that shows the pending state. */
export function NavLink({
  href,
  ...rest
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const { go } = useNav();
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        if (isModified(e)) return;
        e.preventDefault();
        go(href);
      }}
    />
  );
}

/** A button-styled link inside the page: the date presets. */
export function NavButton({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  const { go } = useNav();
  return (
    <Button
      href={href}
      variant={current ? "secondary" : "outline"}
      size="sm"
      aria-current={current ? "true" : undefined}
      onClick={(e: MouseEvent) => {
        if (isModified(e)) return;
        e.preventDefault();
        go(href);
      }}
    >
      {children}
    </Button>
  );
}

/**
 * The filter form. Submitted as a GET without JavaScript; with it, the same
 * URL is built here — empty fields left out — and visited in the transition.
 */
export function FilterForm({
  action,
  className,
  children,
}: {
  /** The app path the form submits to. */
  action: string;
  className?: string;
  children: ReactNode;
}) {
  const { go } = useNav();
  const locale = useLocale();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const search = new URLSearchParams();
    for (const [name, value] of new FormData(e.currentTarget)) {
      if (typeof value === "string" && value.trim() !== "") search.set(name, value.trim());
    }
    const qs = search.toString();
    go(qs ? `${action}?${qs}` : action);
  }

  return (
    <form
      role="search"
      action={localizePath(action, locale)}
      onSubmit={submit}
      className={className}
    >
      {children}
    </form>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("h-4 w-4 animate-spin motion-reduce:animate-none", className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** The form's submit button, which says it is working while it is. */
export function ApplyButton({ className }: { className?: string }) {
  const { pending } = useNav();
  const t = useT();
  return (
    <Button
      type="submit"
      variant="outline"
      size="sm"
      aria-busy={pending}
      disabled={pending}
      className={cn("gap-2", className)}
    >
      {pending ? <Spinner className="h-3.5 w-3.5" /> : null}
      {t(pending ? "adminPaymentHistory.applying" : "adminPaymentHistory.apply")}
    </Button>
  );
}

/**
 * The figures and the table. While a change loads they dim and stop taking
 * clicks, a bar runs along their top, and a status line tells a screen reader.
 * Both wait a moment before showing, so a quick answer does not flash.
 */
export function PendingResults({ children }: { children: ReactNode }) {
  const { pending, results } = useNav();
  const t = useT();
  return (
    <div ref={results} aria-busy={pending} className="relative scroll-mt-6">
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 -top-3 h-1 overflow-hidden bg-line transition-opacity",
          pending ? "opacity-100 delay-150" : "opacity-0",
        )}
      >
        <div className="h-full w-1/3 animate-[payments-progress_1.1s_ease-in-out_infinite] bg-neon-lime motion-reduce:w-full motion-reduce:animate-none" />
      </div>
      <p
        role="status"
        className={cn(
          "mb-3 flex items-center gap-2 font-mono text-[12px] tracking-widest text-neon-lime uppercase transition-opacity",
          pending ? "opacity-100 delay-150" : "sr-only opacity-0",
        )}
      >
        {pending ? (
          <>
            <Spinner />
            {t("adminPaymentHistory.loading")}
          </>
        ) : null}
      </p>
      <div
        className={cn(
          "transition-opacity",
          pending && "pointer-events-none opacity-40 delay-150",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Numbered pages under the table. `baseHref` is the current URL without a
 * page, so each number only adds one.
 */
export function HistoryPagination({
  page,
  pageCount,
  baseHref,
}: {
  page: number;
  pageCount: number;
  baseHref: string;
}) {
  const { go, results } = useNav();
  const t = useT();

  function goTo(target: number) {
    if (target === page) return;
    const [path, query = ""] = baseHref.split("?");
    const search = new URLSearchParams(query);
    if (target > 1) search.set("page", String(target));
    else search.delete("page");
    const qs = search.toString();
    go(qs ? `${path}?${qs}` : path);
    // The table's top, not the page's: the filters stay where they were.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    results.current?.scrollIntoView({ block: "start", behavior: still ? "auto" : "smooth" });
  }

  return (
    <Pagination
      page={page}
      pageCount={pageCount}
      onChange={goTo}
      label={t("adminPaymentHistory.title")}
    />
  );
}
