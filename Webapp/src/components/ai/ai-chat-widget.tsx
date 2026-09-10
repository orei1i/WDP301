"use client";

import { useEffect, useRef, type FormEvent } from "react";
import { ChefHat, Infinity as InfinityIcon, Lock, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import { useAiChat } from "@/components/providers/ai-chat-provider";
import { useAuthModal } from "@/components/providers/auth-modal-provider";
import { useSession } from "@/components/providers/session-provider";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { SUGGESTED_PROMPTS } from "@/lib/mock/ai";
import { RichText } from "./rich-text";

/**
 * Floating AI Nutrition chat.
 * Guest: trial quota banner (3/3) → when exhausted, input locks and CTA opens the auth modal.
 * Mobile: bottom sheet above the tab bar. Desktop: 400×600 panel bottom-right.
 */
export function AiChatWidget() {
  const { isOpen, openChat, closeChat, messages, isTyping, send, draft, setDraft, context, clearContext, reset } = useAiChat();
  const { role, aiQuota } = useSession();
  const { openAuth } = useAuthModal();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isGuest = role === "guest";
  const left = Math.max(0, aiQuota.limit - aiQuota.used);
  const exhausted = isGuest && left === 0;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeChat();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, closeChat]);

  const onSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    send(draft);
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => (isOpen ? closeChat() : openChat())}
        aria-label={isOpen ? "Close AI nutritionist" : "Open AI nutritionist"}
        aria-expanded={isOpen}
        className={cn(
          "fixed right-4 bottom-24 z-40 flex items-center gap-2 rounded-full bg-stone-900 py-3 pr-4 pl-3 text-sm font-semibold text-white shadow-xl shadow-stone-900/25 transition hover:bg-stone-800 active:scale-95 lg:right-6 lg:bottom-6",
          isOpen && "max-sm:hidden",
        )}
      >
        <span className="relative grid size-8 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600">
          {isOpen ? <X className="size-4" /> : <Sparkles className="size-4" />}
          {isGuest && !isOpen && left > 0 && (
            <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-amber-400 text-[10px] font-bold text-stone-900 ring-2 ring-stone-900">{left}</span>
          )}
        </span>
        <span className="hidden sm:inline">Ask AI</span>
      </button>

      {/* Panel */}
      {isOpen && (
        <section
          role="dialog"
          aria-label="AI Nutritionist chat"
          className="fixed inset-x-0 bottom-0 z-[60] flex h-[88dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl ring-1 ring-stone-200 animate-pop-in sm:inset-x-auto sm:right-6 sm:bottom-40 sm:h-[min(620px,calc(100dvh-12rem))] sm:w-[400px] sm:rounded-3xl lg:bottom-24 lg:h-[min(620px,calc(100dvh-8rem))]"
        >
          {/* Header */}
          <header className="relative flex items-center gap-3 bg-emerald-800 px-4 py-3.5 text-white">
            <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-inner">
              <ChefHat className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-display font-semibold">
                AI Nutritionist <Badge tone="amber" variant="solid">Beta</Badge>
              </p>
              <p className="truncate text-xs text-emerald-100/80">Not medical advice</p>
            </div>
            {messages.length > 0 && (
              <button onClick={reset} className="rounded-full p-2 text-emerald-100 hover:bg-white/10" aria-label="New chat">
                <RotateCcw className="size-4" />
              </button>
            )}
            <button onClick={closeChat} className="rounded-full p-2 text-emerald-100 hover:bg-white/10" aria-label="Close">
              <X className="size-5" />
            </button>
          </header>

          {/* Quota banner */}
          {isGuest ? (
            <div className={cn("flex items-center gap-3 px-4 py-2.5 text-xs", exhausted ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900")}>
              <div className="flex-1">
                <p className="font-semibold">{exhausted ? "Free trial used up" : `${left}/${aiQuota.limit} free queries left`}</p>
                <div className="mt-1 flex gap-1">
                  {Array.from({ length: aiQuota.limit }).map((_, i) => (
                    <span key={i} className={cn("h-1 flex-1 rounded-full", i < left ? "bg-amber-500" : "bg-amber-200/70")} />
                  ))}
                </div>
              </div>
              <button onClick={() => openAuth("register", exhausted ? "ai-quota" : undefined)} className="shrink-0 font-semibold text-emerald-700 hover:underline">
                Get unlimited
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-800">
              <InfinityIcon className="size-4" /> Unlimited queries with your account
            </div>
          )}

          {/* Messages */}
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto bg-stone-50/60 px-4 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="py-4 text-center">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Sparkles className="size-7" />
                </span>
                <p className="mt-3 font-display text-lg font-semibold text-stone-900">Hi! What's on your plate?</p>
                <p className="mx-auto mt-1 max-w-[260px] text-sm text-stone-500">Ask about protein, B12, swaps — or any recipe you're viewing.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      disabled={exhausted}
                      className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <p className="max-w-[80%] rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2 text-sm text-white">{m.content}</p>
                </div>
              ) : (
                <div key={m.id} className="flex gap-2">
                  <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                    <Sparkles className="size-3.5" />
                  </span>
                  <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm text-stone-700 shadow-sm ring-1 ring-stone-100">
                    <RichText text={m.content} />
                  </div>
                </div>
              ),
            )}

            {isTyping && (
              <div className="flex gap-2" aria-label="AI is typing">
                <span className="grid size-7 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <Sparkles className="size-3.5" />
                </span>
                <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm ring-1 ring-stone-100">
                  {[0, 150, 300].map((d) => (
                    <span key={d} className="size-1.5 animate-bounce rounded-full bg-stone-400" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}

            {exhausted && !isTyping && (
              <div className="rounded-2xl bg-white p-4 text-center shadow-sm ring-1 ring-amber-200">
                <Lock className="mx-auto size-5 text-amber-600" />
                <p className="mt-2 text-sm font-semibold text-stone-900">You've used all 3 free questions</p>
                <p className="mt-0.5 text-xs text-stone-500">Create a free account to keep chatting — unlimited.</p>
                <div className="mt-3 flex justify-center gap-2">
                  <Button size="sm" onClick={() => openAuth("register", "ai-quota")}>Create account</Button>
                  <Button size="sm" variant="outline" onClick={() => openAuth("login", "ai-quota")}>Log in</Button>
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={onSubmit} className="border-t border-stone-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {context && (
              <div className="mb-2 flex items-center gap-2">
                <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-emerald-50 py-1 pr-1 pl-2.5 text-xs font-medium text-emerald-800">
                  <ChefHat className="size-3.5 shrink-0" />
                  <span className="truncate">About: {context.title}</span>
                  <button type="button" onClick={clearContext} className="rounded-full p-0.5 hover:bg-emerald-100" aria-label="Remove recipe context">
                    <X className="size-3" />
                  </button>
                </span>
              </div>
            )}
            <div className={cn("flex items-end gap-2 rounded-2xl border bg-stone-50 p-1.5 pl-3.5 transition focus-within:border-emerald-500 focus-within:bg-white", exhausted ? "border-stone-200 opacity-60" : "border-stone-200")}>
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                disabled={exhausted}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                placeholder={exhausted ? "Log in to keep chatting" : "Ask about nutrition…"}
                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-stone-400 field-sizing-content"
                aria-label="Message"
              />
              <Button type="submit" size="icon-sm" className="size-9" disabled={!draft.trim() || isTyping || exhausted} aria-label="Send">
                <SendHorizontal />
              </Button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
