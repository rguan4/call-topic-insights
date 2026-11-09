import type { RangeKey } from '@cti/shared';

export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Last complete day of data (UTC midnight). Offsets count back from this day. */
export const DATA_END = Date.UTC(2026, 10, 7);
export const SYNCED_AT = 'Nov 8, 2026, 6:00 AM PT';

export const RANGES: Record<RangeKey, { days: number; label: string }> = {
  '7d': { days: 7, label: 'Last 7 days' },
  '30d': { days: 30, label: 'Last 30 days' },
  '90d': { days: 90, label: 'Last 90 days' }
};

export function dOff(off: number): Date {
  return new Date(DATA_END - off * 864e5);
}
export function fmt(d: Date): string {
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
export function fmtS(d: Date): string {
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
/** "Oct 9 – Nov 7, 2026" from an older and a newer day offset. */
export function span(older: number, newer: number): string {
  return `${fmtS(dOff(older))} – ${fmt(dOff(newer))}`;
}
