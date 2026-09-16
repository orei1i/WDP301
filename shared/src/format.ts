const TZ = 'Asia/Ho_Chi_Minh';
const DAY = 86_400_000;

const nf = new Intl.NumberFormat('vi-VN');
export const vnd = (n: number) => `${nf.format(Math.round(n))} ₫`;
export const compactVnd = (n: number) => {
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2).replace('.', ',')} tỷ`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1).replace('.', ',')} tr`;
  return vnd(n);
};
export const pct = (v: number, digits = 0) => `${(v * 100).toFixed(digits).replace('.', ',')}%`;

/** Date-only values are stored as the facility-local calendar day at 00:00Z. */
export function todayISO(): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return `${ymd}T00:00:00.000Z`;
}
export const addDays = (iso: string, n: number) => new Date(new Date(iso).getTime() + n * DAY).toISOString();
export function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(d.getUTCDate(), last));
  return r.toISOString();
}
export const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);
export const monthKey = (iso: string) => iso.slice(0, 7);

const dFmt = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const dtFmt = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ });
export const fmtDate = (iso?: string | null) => (iso ? dFmt.format(new Date(iso)) : '—');
export const fmtDateTime = (iso?: string | null) => (iso ? dtFmt.format(new Date(iso)) : '—');
export const fmtMonth = (key: string) => `T${Number(key.slice(5, 7))}/${key.slice(2, 4)}`;

export function relativeDay(iso: string): string {
  const d = daysBetween(todayISO(), iso);
  if (d === 0) return 'Hôm nay';
  if (d === 1) return 'Ngày mai';
  if (d === -1) return 'Hôm qua';
  return d > 0 ? `${d} ngày nữa` : `${-d} ngày trước`;
}

export function minutesLeft(iso?: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
}

export const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(-2).map((p) => p[0]).join('').toUpperCase();
