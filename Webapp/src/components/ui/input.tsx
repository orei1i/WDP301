import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type InputProps = ComponentProps<"input"> & {
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  wrapperClassName?: string;
};

export function Input({ leftIcon, rightSlot, className, wrapperClassName, ...props }: InputProps) {
  return (
    <div
      className={cn(
        "flex h-10 items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3.5 text-sm text-stone-900",
        "transition focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-500/10",
        "[&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-stone-400",
        wrapperClassName,
      )}
    >
      {leftIcon}
      <input
        className={cn("h-full w-full min-w-0 bg-transparent outline-none placeholder:text-stone-400", className)}
        {...props}
      />
      {rightSlot}
    </div>
  );
}
