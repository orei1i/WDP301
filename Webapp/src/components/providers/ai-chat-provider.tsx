"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { mockAiReply, type AiContext } from "@/lib/mock/ai";
import { useAuthModal } from "./auth-modal-provider";
import { useSession } from "./session-provider";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

type AiChatContextValue = {
  isOpen: boolean;
  messages: ChatMessage[];
  isTyping: boolean;
  context?: AiContext;
  draft: string;
  setDraft: (v: string) => void;
  openChat: (opts?: { prompt?: string; context?: AiContext }) => void;
  closeChat: () => void;
  clearContext: () => void;
  send: (text: string) => void;
  reset: () => void;
};

const AiChatContext = createContext<AiChatContextValue | null>(null);

/** MOCK AI chat state. Replace `mockAiReply` with a streaming API route later. */
export function AiChatProvider({ children }: { children: ReactNode }) {
  const { consumeAiQuery } = useSession();
  const { openAuth } = useAuthModal();
  const [isOpen, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setTyping] = useState(false);
  const [context, setContext] = useState<AiContext>();
  const [draft, setDraft] = useState("");
  const idRef = useRef(0);
  const nextId = () => `m${++idRef.current}`;

  const openChat = useCallback((opts?: { prompt?: string; context?: AiContext }) => {
    if (opts?.context) setContext(opts.context);
    if (opts?.prompt) setDraft(opts.prompt);
    setOpen(true);
  }, []);

  const send = useCallback(
    (text: string) => {
      const prompt = text.trim();
      if (!prompt || isTyping) return;
      if (!consumeAiQuery()) {
        openAuth("register", "ai-quota");
        return;
      }
      setMessages((m) => [...m, { id: nextId(), role: "user", content: prompt }]);
      setDraft("");
      setTyping(true);
      const ctx = context;
      window.setTimeout(() => {
        setMessages((m) => [...m, { id: nextId(), role: "assistant", content: mockAiReply(prompt, ctx) }]);
        setTyping(false);
      }, 900 + Math.random() * 600);
    },
    [consumeAiQuery, openAuth, context, isTyping],
  );

  const value = useMemo<AiChatContextValue>(
    () => ({
      isOpen,
      messages,
      isTyping,
      context,
      draft,
      setDraft,
      openChat,
      closeChat: () => setOpen(false),
      clearContext: () => setContext(undefined),
      send,
      reset: () => {
        setMessages([]);
        setContext(undefined);
      },
    }),
    [isOpen, messages, isTyping, context, draft, openChat, send],
  );

  return <AiChatContext.Provider value={value}>{children}</AiChatContext.Provider>;
}

export function useAiChat() {
  const ctx = useContext(AiChatContext);
  if (!ctx) throw new Error("useAiChat must be used inside <AiChatProvider>");
  return ctx;
}
