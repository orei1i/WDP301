import { Avatar, ButtonLink, Card, CardBody } from "@/components/ui";
import { compactNumber } from "@/lib/format";
import type { User } from "@/types";

export function AuthorCard({ user }: { user: User }) {
  return (
    <Card>
      <CardBody className="text-center">
        <Avatar name={user.name} src={user.avatarUrl} size="lg" verified={user.role === "verified-chef"} className="mx-auto" />
        <p className="mt-2 font-display font-semibold text-stone-900">{user.name}</p>
        <p className="text-xs text-stone-500">
          @{user.handle}
          {user.location && ` · ${user.location}`}
        </p>
        <dl className="mt-4 grid grid-cols-3 divide-x divide-stone-100 rounded-xl bg-stone-50 py-2.5">
          {[
            ["Recipes", user.stats?.recipes ?? 0],
            ["Posts", user.stats?.posts ?? 0],
            ["Followers", user.stats?.followers ?? 0],
          ].map(([k, v]) => (
            <div key={k}>
              <dd className="text-sm font-semibold text-stone-900 tabular-nums">{compactNumber(Number(v))}</dd>
              <dt className="text-[11px] text-stone-500">{k}</dt>
            </div>
          ))}
        </dl>
        <ButtonLink href={`/recipes?author=${user.handle}`} variant="outline" size="sm" className="mt-4 w-full">
          View all recipes
        </ButtonLink>
      </CardBody>
    </Card>
  );
}
