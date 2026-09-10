/** 12400 → "12.4k" */
export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** 245 → "4:05" */
export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Relative time against a fixed "now" so SSR and client render the same string. */
export const MOCK_NOW = new Date("2026-09-10T18:00:00+07:00").getTime();

export function timeAgo(iso: string, now: number = MOCK_NOW): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.round(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

const FRACTIONS: [number, string][] = [
  [0.125, "⅛"], [0.25, "¼"], [0.333, "⅓"], [0.5, "½"], [0.667, "⅔"], [0.75, "¾"],
];

/** 1.5 → "1½", 0.25 → "¼", 133.33 → "135" (rounds big numbers to friendly steps). */
export function formatQuantity(q: number | null): string {
  if (q == null) return "";
  if (q >= 20) return String(Math.round(q / 5) * 5);
  if (q >= 5) return String(Math.round(q));
  const whole = Math.floor(q);
  const rest = q - whole;
  if (rest < 0.06) return String(whole || q.toFixed(1));
  if (rest > 0.94) return String(whole + 1);
  const [, glyph] = FRACTIONS.reduce((best, f) => (Math.abs(f[0] - rest) < Math.abs(best[0] - rest) ? f : best));
  return `${whole || ""}${glyph}`;
}
