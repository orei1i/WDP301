"use client";

import { useState } from "react";
import { ArrowLeft, Menu, Search } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { AuthHeader } from "./auth-header";
import { Logo } from "./logo";

type NavbarProps = { onOpenMenu: () => void };

export function Navbar({ onOpenMenu }: NavbarProps) {
  const [mobileSearch, setMobileSearch] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      <div className="flex h-16 items-center gap-3 px-3 sm:px-5 lg:px-6">
        {mobileSearch ? (
          <div className="flex w-full items-center gap-2 md:hidden">
            <Button variant="ghost" size="icon" aria-label="Close search" onClick={() => setMobileSearch(false)}>
              <ArrowLeft />
            </Button>
            <SearchField autoFocus />
          </div>
        ) : (
          <>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={onOpenMenu}>
              <Menu />
            </Button>
            <Logo className="lg:w-[216px]" />

            <div className="hidden max-w-xl flex-1 md:block">
              <SearchField />
            </div>

            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Search" onClick={() => setMobileSearch(true)}>
                <Search />
              </Button>
              <AuthHeader />
            </div>
          </>
        )}
      </div>
    </header>
  );
}

function SearchField({ autoFocus }: { autoFocus?: boolean }) {
  return (
    <form role="search" action="/search" className="w-full">
      <Input
        name="q"
        type="search"
        autoFocus={autoFocus}
        placeholder="Search recipes, threads, restaurants…"
        aria-label="Search VeggieHub"
        leftIcon={<Search />}
        rightSlot={
          <kbd className="hidden whitespace-nowrap rounded-md border border-stone-200 bg-white px-1.5 py-0.5 font-sans text-[10px] font-medium text-stone-400 lg:inline">
            Ctrl K
          </kbd>
        }
      />
    </form>
  );
}
