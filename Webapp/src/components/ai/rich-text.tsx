import { Fragment, type ReactNode } from "react";

/** Tiny formatter for mock AI replies: paragraphs, "- " bullets, **bold**. */
export function RichText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={`ul${blocks.length}`} className="my-1.5 list-disc space-y-0.5 pl-4 marker:text-emerald-500">
        {bullets.map((b, i) => (
          <li key={i}>{bold(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  text.split("\n").forEach((line, i) => {
    if (line.startsWith("- ")) return void bullets.push(line.slice(2));
    flush();
    if (line.trim()) blocks.push(<p key={i} className="my-1 first:mt-0 last:mb-0">{bold(line)}</p>);
  });
  flush();
  return <>{blocks}</>;
}

function bold(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
