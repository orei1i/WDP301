const TZ = 'Asia/Ho_Chi_Minh';
const DAY = 86_400_000;

/** Date-only convention: facility-local calendar day stored as 00:00Z. */
export function todayUTC(): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export function addMonthsUTC(d: Date, months: number): Date {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(d.getUTCDate(), last));
  return r;
}
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);
/** Normalise "2026-09-11" or any ISO string to the date-only convention. */
export const toDateOnly = (v: string | Date) => new Date(`${new Date(v).toISOString().slice(0, 10)}T00:00:00.000Z`);
