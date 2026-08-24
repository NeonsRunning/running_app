"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Session } from "@/lib/auth/session";

export type { Session };

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return ctx;
}

/**
 * The signed-in account, read once on the server and handed down.
 *
 * There are no mutators on this context. Signing out and switching on the
 * organizer tools are server actions: they change the session cookie or the
 * user record, and the layout re-renders with the new truth. A client-side
 * setter would only ever be a guess about what the server did.
 */
export function SessionProvider({
  value,
  children,
}: {
  value: Session;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
