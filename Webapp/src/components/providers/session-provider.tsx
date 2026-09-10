"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { DEMO_ACCOUNTS } from "@/lib/mock/users";
import type { Session, SessionRole } from "@/types";

/**
 * MOCK session. Swap for NextAuth / real API later — consumers only use `useSession()`.
 */
type SessionContextValue = Session & {
  signInAs: (role: Exclude<SessionRole, "guest">) => void;
  signOut: () => void;
  consumeAiQuery: () => boolean;
};

const GUEST_AI_LIMIT = 3;

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children, initialRole = "guest" }: { children: ReactNode; initialRole?: SessionRole }) {
  const [role, setRole] = useState<SessionRole>(initialRole);
  const [aiUsed, setAiUsed] = useState(0);

  const signInAs = useCallback((r: Exclude<SessionRole, "guest">) => setRole(r), []);
  const signOut = useCallback(() => setRole("guest"), []);

  const value = useMemo<SessionContextValue>(() => {
    const user = role === "guest" ? null : DEMO_ACCOUNTS[role];
    const limit = role === "guest" ? GUEST_AI_LIMIT : Infinity;
    return {
      role,
      user,
      aiQuota: { used: aiUsed, limit },
      signInAs,
      signOut,
      consumeAiQuery: () => {
        if (aiUsed >= limit) return false;
        setAiUsed((n) => n + 1);
        return true;
      },
    };
  }, [role, aiUsed, signInAs, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
