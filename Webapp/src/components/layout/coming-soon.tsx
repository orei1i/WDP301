import { Sprout } from "lucide-react";
import { ButtonLink } from "@/components/ui";

/** Placeholder for routes scheduled in later milestones. */
export function ComingSoon({ title, note }: { title: string; note?: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-24 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
        <Sprout className="size-7" />
      </span>
      <h1 className="mt-5 font-display text-2xl font-semibold text-stone-900">{title}</h1>
      <p className="mt-2 text-sm text-stone-500">{note ?? "This screen is on the roadmap — UI lands in the next milestone."}</p>
      <ButtonLink href="/" variant="outline" className="mt-6">
        Back to Discover
      </ButtonLink>
    </div>
  );
}
