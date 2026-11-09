import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VersionInfo } from '@cti/shared';

/**
 * Mutable application state. Note data itself is generated deterministically and is
 * never stored here. State is persisted to backend/data/state.json unless
 * CTI_PERSIST=false (tests).
 *
 * Each service owns one slice. Only touch your own slice:
 *  - reports, digests        → notes service (routes/notes.ts)
 *  - insights                → AI insights service (services/insights.ts)
 *  - emerging                → emerging topics service (services/emerging.ts)
 *  - taxonomy                → label management service (services/labels.ts)
 *  - activeVersion, versions → label management service (publish/activate)
 */
export interface AppState {
  activeVersion: string;
  versions: VersionInfo[];
  /** Reports of incorrect classification, keyed by note ID. */
  reports: Record<string, { reason: string; suggestedSubId: string | null; comment: string; ref: string; by: string; at: string }>;
  /** Digest subscriptions, keyed by `${userId}:${topicId}:${subId}`. */
  digests: Record<string, { frequency: 'weekly' | 'daily'; since: string }>;
  /** Owned by the AI insights service. */
  insights: Record<string, unknown>;
  /** Owned by the emerging topics service. */
  emerging: Record<string, unknown>;
  /** Owned by the label management service. */
  taxonomy: Record<string, unknown>;
  /** Extra notes with no suitable topic, added when failed notes are reprocessed. */
  noTopicExtra: number;
}

function defaults(): AppState {
  return {
    activeVersion: 'v7',
    versions: [
      { id: 'v7', status: 'active', publishedAt: 'Oct 15, 2026' },
      { id: 'v6', status: 'previous', publishedAt: 'Aug 4, 2026' },
      { id: 'v1', status: 'previous', publishedAt: 'Mar 2, 2026' }
    ],
    reports: {},
    digests: {},
    insights: {},
    emerging: {},
    taxonomy: {},
    noTopicExtra: 0
  };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.CTI_DATA_FILE ?? path.resolve(here, '../../data/state.json');
const PERSIST = process.env.CTI_PERSIST !== 'false';

function load(): AppState {
  if (!PERSIST) return defaults();
  try {
    return { ...defaults(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return defaults();
  }
}

export const state: AppState = load();

export function save(): void {
  if (!PERSIST) return;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

/** Restore defaults (used by tests and `POST /api/dev/reset`). */
export function resetState(): void {
  const fresh = defaults();
  for (const k of Object.keys(state) as (keyof AppState)[]) delete (state as Partial<AppState>)[k];
  Object.assign(state, fresh);
  for (const fn of resetHooks) fn();
  save();
}

const resetHooks: (() => void)[] = [];
/** Services with in-memory caches register a hook to clear them on reset. */
export function onReset(fn: () => void): void {
  resetHooks.push(fn);
}
