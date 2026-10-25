import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo";

/** Sign-in and account recovery screens: nothing to list in search. */
export const metadata: Metadata = { robots: NOINDEX };

export default function AuthLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    <div id="main" className="bg-ink">
      {children}
    </div>
  );
}
