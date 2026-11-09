export const num = (n: number) => Math.round(n).toLocaleString('en-US');

export const pctText = (p: number) => `${p.toFixed(1)}%`;

/** "+34%", "−12%", "0%" */
export function changeText(p: number): string {
  const r = Math.round(p);
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}%`;
}

export function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1))));
  const f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
