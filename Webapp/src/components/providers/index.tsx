"use client";

import type { ReactNode } from "react";
import { AiChatProvider } from "./ai-chat-provider";
import { AuthModalProvider } from "./auth-modal-provider";
import { SessionProvider } from "./session-provider";

/** Order matters: AI chat needs session (quota) + auth modal (upsell). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthModalProvider>
        <AiChatProvider>{children}</AiChatProvider>
      </AuthModalProvider>
    </SessionProvider>
  );
}

export { useSession } from "./session-provider";
export { useAuthModal } from "./auth-modal-provider";
export { useAiChat } from "./ai-chat-provider";
