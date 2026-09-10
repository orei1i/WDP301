"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Mobile renders as a bottom sheet by default. */
  sheetOnMobile?: boolean;
};

const SIZES = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

export function Modal({ open, onClose, title, description, children, footer, size = "md", sheetOnMobile = true }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={cn("fixed inset-0 z-[70] flex justify-center p-0 sm:items-center sm:p-4", sheetOnMobile ? "items-end" : "items-center p-4")}>
      <div className="absolute inset-0 bg-stone-950/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-white shadow-2xl outline-none animate-pop-in",
          sheetOnMobile ? "rounded-t-3xl sm:rounded-3xl" : "rounded-3xl",
          SIZES[size],
        )}
      >
        {(title || description) && (
          <header className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 pt-6 pb-4">
            <div>
              {title && (
                <h2 id={titleId} className="font-display text-lg font-semibold text-stone-900">
                  {title}
                </h2>
              )}
              {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="-mr-2 rounded-full p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </header>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-stone-100 px-6 py-4">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
