"use client";

import { Bookmark, CalendarDays, MessagesSquare, Sparkles, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui";
import type { AuthMode, AuthReason } from "@/components/providers/auth-modal-provider";
import { AuthForm } from "./auth-form";

const REASONS: Record<AuthReason, { icon: typeof Sparkles; title: string; body: string }> = {
  "ai-quota": { icon: Sparkles, title: "You've used your 3 free AI queries", body: "Create a free account for unlimited nutrition answers." },
  save: { icon: Bookmark, title: "Save recipes to your cookbook", body: "Sign in to bookmark and organise recipes." },
  plan: { icon: CalendarDays, title: "Plan your week", body: "Sign in to add recipes to your meal planner." },
  post: { icon: MessagesSquare, title: "Join the conversation", body: "Sign in to post threads and reply." },
  follow: { icon: UserPlus, title: "Follow your favourite creators", body: "Sign in to follow and get new recipes first." },
};

type AuthModalProps = {
  open: boolean;
  mode: AuthMode;
  reason?: AuthReason;
  onModeChange: (m: AuthMode) => void;
  onClose: () => void;
};

export function AuthModal({ open, mode, reason, onModeChange, onClose }: AuthModalProps) {
  const r = reason ? REASONS[reason] : null;
  return (
    <Modal open={open} onClose={onClose} title={mode === "login" ? "Welcome back" : "Join VeggieHub"} description="120k plant-based cooks, one kitchen table." size="md">
      {r && (
        <div className="mb-5 flex gap-3 rounded-2xl bg-amber-50 p-3.5 ring-1 ring-amber-200/70">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-400 text-stone-900">
            <r.icon className="size-5" />
          </span>
          <div className="text-sm">
            <p className="font-semibold text-stone-900">{r.title}</p>
            <p className="text-stone-600">{r.body}</p>
          </div>
        </div>
      )}
      <AuthForm mode={mode} onModeChange={onModeChange} onSuccess={onClose} onContinueAsGuest={onClose} />
    </Modal>
  );
}
