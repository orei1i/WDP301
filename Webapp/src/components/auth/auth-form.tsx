"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail, UserRound } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { AuthMode } from "@/components/providers/auth-modal-provider";

type AuthFormProps = {
  mode: AuthMode;
  onModeChange: (m: AuthMode) => void;
  onSuccess?: () => void;
  onContinueAsGuest?: () => void;
};

type Errors = Partial<Record<"name" | "email" | "password" | "terms", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function passwordScore(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s; // 0–4
}
const STRENGTH = ["Too weak", "Weak", "Okay", "Good", "Strong"];
const STRENGTH_COLOR = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];

/**
 * Shared Login / Register form (used by AuthModal and the /login, /register pages).
 * MOCK: any valid input signs in; emails starting with "admin" sign in as Admin.
 */
export function AuthForm({ mode, onModeChange, onSuccess, onContinueAsGuest }: AuthFormProps) {
  const { signInAs } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const isRegister = mode === "register";
  const score = passwordScore(password);

  function validate(): Errors {
    const e: Errors = {};
    if (isRegister && name.trim().length < 2) e.name = "Tell us your name.";
    if (!EMAIL_RE.test(email)) e.email = "Enter a valid email address.";
    if (password.length < 8) e.password = "Use at least 8 characters.";
    if (isRegister && !terms) e.terms = "Please accept the community guidelines.";
    return e;
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setLoading(true);
    window.setTimeout(() => {
      signInAs(email.toLowerCase().startsWith("admin") ? "admin" : "user");
      setLoading(false);
      onSuccess?.();
    }, 700);
  }

  return (
    <div>
      {/* Segmented Login / Register */}
      <div role="tablist" className="grid grid-cols-2 rounded-full bg-stone-100 p-1 text-sm font-medium">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setErrors({});
              onModeChange(m);
            }}
            className={cn("rounded-full py-2 transition", mode === m ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800")}
          >
            {m === "login" ? "Log in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-3.5">
        {isRegister && (
          <Field label="Display name" error={errors.name}>
            <Input leftIcon={<UserRound />} value={name} onChange={(e) => setName(e.target.value)} placeholder="Mai Tran" autoComplete="name" wrapperClassName="h-11 rounded-xl" aria-invalid={!!errors.name} />
          </Field>
        )}
        <Field label="Email" error={errors.email}>
          <Input leftIcon={<Mail />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" wrapperClassName="h-11 rounded-xl" aria-invalid={!!errors.email} />
        </Field>
        <Field
          label="Password"
          error={errors.password}
          aside={!isRegister && <a href="#" className="text-xs font-medium text-emerald-700 hover:underline">Forgot?</a>}
        >
          <Input
            leftIcon={<Lock />}
            type={showPw ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isRegister ? "At least 8 characters" : "••••••••"}
            autoComplete={isRegister ? "new-password" : "current-password"}
            wrapperClassName="h-11 rounded-xl"
            aria-invalid={!!errors.password}
            rightSlot={
              <button type="button" onClick={() => setShowPw((s) => !s)} className="text-stone-400 hover:text-stone-700" aria-label={showPw ? "Hide password" : "Show password"}>
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          />
          {isRegister && password && (
            <div className="mt-2 flex items-center gap-2">
              <div className="grid flex-1 grid-cols-4 gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={cn("h-1 rounded-full", i < score ? STRENGTH_COLOR[score] : "bg-stone-200")} />
                ))}
              </div>
              <span className="w-16 text-right text-[11px] text-stone-500">{STRENGTH[score]}</span>
            </div>
          )}
        </Field>

        {isRegister ? (
          <label key="terms" className="flex items-start gap-2.5 text-sm text-stone-600">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 size-4 rounded accent-emerald-600" />
            <span>
              I agree to the <a href="#" className="font-medium text-emerald-700 hover:underline">community guidelines</a> and privacy policy.
              {errors.terms && <span className="mt-1 block text-xs text-rose-600">{errors.terms}</span>}
            </span>
          </label>
        ) : (
          <label key="remember" className="flex items-center gap-2.5 text-sm text-stone-600">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 rounded accent-emerald-600" /> Keep me signed in
          </label>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading && <Loader2 className="animate-spin" />}
          {isRegister ? "Create free account" : "Log in"}
        </Button>
      </form>

      {onContinueAsGuest && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-stone-400">
            <span className="h-px flex-1 bg-stone-200" /> or <span className="h-px flex-1 bg-stone-200" />
          </div>
          <Button variant="outline" size="lg" className="w-full" onClick={onContinueAsGuest}>
            Continue as guest
          </Button>
          <p className="mt-2 text-center text-xs text-stone-400">Browse recipes & forum · 3 free AI queries</p>
        </>
      )}

      <p className="mt-5 rounded-xl bg-stone-50 px-3 py-2 text-center text-[11px] text-stone-400">
        Demo: any email + 8-char password works. Emails starting with <code className="text-stone-600">admin</code> sign in as Admin.
      </p>
    </div>
  );
}

function Field({ label, error, aside, children }: { label: string; error?: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-stone-700">{label}</span>
        {aside}
      </div>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
