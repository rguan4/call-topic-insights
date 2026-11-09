import { dOff, fmt } from './dates';
import { SUB, templatesOf, type SubDef } from './catalog';

/**
 * Deterministic sample data. Every note has a fixed ID, date, time, text and topic,
 * so the same record looks identical on every page and for every date range.
 */

export interface Note {
  id: string;
  /** Index within its subtopic, newest first. */
  i: number;
  /** Days before DATA_END (0 = Nov 7, 2026). */
  off: number;
  date: string;
  time: string;
  subId: string;
  /** Template indexes the note mentions (a note can mention more than one issue). */
  tags: number[];
  excerpt: string;
  full: string;
  baseStatus: 'Classified' | 'Low confidence' | 'Reported';
  confidence: number;
  similarity: number;
  handling: string;
}

const PATTERN = [0, 2, 0, 3, 1, 0, 2, 3, 0, 1];
const TAILS = [
  'Client said that answered the question.',
  'Sent a follow-up email with the steps.',
  "Client will call back if it isn't resolved by Friday."
];
const HANDLING = ['Resolved during the call', 'Follow-up email sent', 'Resolved during the call', 'Escalated to Operations'];
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const dayCache = new Map<string, number[]>();
const noteCache = new Map<string, Note[]>();

/**
 * Notes per day for 180 days, newest first. Days 0–29 sum to `n`, days 30–59 to the
 * previous 30-day period implied by `change`, so period-over-period math is exact.
 */
export function dayCounts(s: SubDef): number[] {
  const hit = dayCache.get(s.id);
  if (hit) return hit;
  const c = s.change / 100;
  const n0 = s.n;
  const n1 = Math.round(n0 / (1 + c));
  const n2 = Math.round(n1 / (1 + c / 2));
  const n3 = Math.round((3 * n2) / (1 + c / 2));
  const arr = new Array<number>(180).fill(0);
  const blocks: [number, number, number][] = [[0, 30, n0], [30, 60, n1], [60, 90, n2], [90, 180, n3]];
  for (const [a, z, n] of blocks) {
    const w: number[] = [];
    let sum = 0;
    for (let d = a; d < z; d++) {
      const dow = dOff(d).getUTCDay();
      const v = (1 + c * 0.4 * (1 - (d - a) / (z - a))) * (dow === 0 || dow === 6 ? 0.45 : 1) * (1 + 0.14 * Math.sin(d * 1.7 + s.seed));
      w.push(v);
      sum += v;
    }
    const base = w.map((v) => Math.floor((n * v) / sum));
    const rem = n - base.reduce((x, y) => x + y, 0);
    const order = w.map((v, k) => [(n * v) / sum - Math.floor((n * v) / sum), k] as const).sort((x, y) => y[0] - x[0]);
    for (let k = 0; k < rem; k++) base[order[k % order.length][1]] += 1;
    base.forEach((v, k) => { arr[a + k] = v; });
  }
  dayCache.set(s.id, arr);
  return arr;
}

/** Notes for a subtopic between day offsets [from, to). */
export function countBetween(s: SubDef, from: number, to: number): number {
  const arr = dayCounts(s);
  let t = 0;
  for (let d = from; d < to; d++) t += arr[d];
  return t;
}

/** All note records for the last 90 days of a subtopic, newest first. */
export function notesOf(s: SubDef): Note[] {
  const hit = noteCache.get(s.id);
  if (hit) return hit;
  const arr = dayCounts(s);
  const tpl = templatesOf(s);
  const out: Note[] = [];
  let i = 0;
  for (let d = 0; d < 90; d++) {
    const k = arr[d];
    for (let j = 0; j < k; j++) {
      const ti = PATTERN[i % 10];
      const tags = [ti];
      let extra = '';
      if (i % 7 === 3) {
        const o = (ti + 2) % 4;
        tags.push(o);
        extra = ` Also mentioned: ${lc(tpl[o][1])}.`;
      }
      const mins = 1070 - Math.floor((j * 590) / Math.max(1, k)) - (s.seed % 7);
      const hh = Math.floor(mins / 60);
      const mm = mins % 60;
      const h12 = ((hh + 11) % 12) + 1;
      const low = i % 29 === 13;
      const rep = !low && i % 113 === 17;
      out.push({
        id: `SN-${400000 + s.seed * 10000 + i}`,
        i,
        off: d,
        date: fmt(dOff(d)),
        time: `${h12}:${mm < 10 ? '0' : ''}${mm} ${hh >= 12 ? 'PM' : 'AM'} PT`,
        subId: s.id,
        tags,
        excerpt: tpl[ti][0] + extra,
        full: `${tpl[ti][0]}${extra} ${TAILS[i % 3]}`,
        baseStatus: low ? 'Low confidence' : rep ? 'Reported' : 'Classified',
        confidence: low ? 0.42 + (i % 7) / 50 : 0.82 + (i % 8) / 50,
        similarity: 0.97 - ((i * 37) % 41) / 100,
        handling: HANDLING[i % 4]
      });
      i += 1;
    }
  }
  noteCache.set(s.id, out);
  return out;
}

/**
 * Notes that don't belong to a modelled subtopic (e.g. candidate-topic notes with
 * "No suitable topic"). Registered by the emerging topics service.
 */
export interface ExtraNote {
  id: string;
  date: string;
  time: string;
  excerpt: string;
  full: string;
  /** Shown as the topic path, e.g. "No suitable topic (candidate: Bond ladder setup questions)". */
  label: string;
  handling: string;
}
const extraNotes = new Map<string, ExtraNote>();
export function registerExtraNote(n: ExtraNote): void {
  extraNotes.set(n.id, n);
}

const subBySeed = new Map<number, SubDef>(Object.values(SUB).map((s) => [s.seed, s]));

/** Look a note up by ID. Generated notes encode their subtopic and index in the ID. */
export function findNote(id: string): { note: Note } | { extra: ExtraNote } | null {
  const m = /^SN-(\d+)$/.exec(id);
  if (!m) return null;
  const n = Number(m[1]) - 400000;
  const s = subBySeed.get(Math.floor(n / 10000));
  if (s) {
    const note = notesOf(s)[n % 10000];
    return note ? { note } : null;
  }
  const extra = extraNotes.get(id);
  return extra ? { extra } : null;
}
