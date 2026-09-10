"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AuthModal } from "@/components/auth/auth-modal";

export type AuthMode = "login" | "register";
/** Why the modal opened — drives the contextual banner. */
export type AuthReason = "ai-quota" | "save" | "plan" | "post" | "follow";

type AuthModalState = { open: boolean; mode: AuthMode; reason?: AuthReason };

type AuthModalContextValue = {
  openAuth: (mode?: AuthMode, reason?: AuthReason) => void;
  closeAuth: () => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthModalState>({ open: false, mode: "login" });

  const openAuth = useCallback((mode: AuthMode = "login", reason?: AuthReason) => setState({ open: true, mode, reason }), []);
  const closeAuth = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  const value = useMemo(() => ({ openAuth, closeAuth }), [openAuth, closeAuth]);

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <AuthModal
        open={state.open}
        mode={state.mode}
        reason={state.reason}
        onModeChange={(mode) => setState((s) => ({ ...s, mode }))}
        onClose={closeAuth}
      />
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error("useAuthModal must be used inside <AuthModalProvider>");
  return ctx;
}
