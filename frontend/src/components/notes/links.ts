/** Build a link that keeps the current filter query string and sets/removes extra params. */
export function withQuery(path: string, search: string, extra: Record<string, string | number | null | undefined> = {}): string {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  for (const [k, v] of Object.entries(extra)) {
    if (v === null || v === undefined || v === '') p.delete(k);
    else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

export function statusChip(status: string): string {
  return status === 'Classified' ? 'chip-violet' : status === 'Low confidence' ? 'chip-warm' : status === 'Reported' ? 'chip-dark' : 'chip-neutral';
}
