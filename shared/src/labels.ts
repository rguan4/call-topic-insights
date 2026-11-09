// Label management, drafts and versions contracts. Owner: label management service.
// DraftChange / DraftChangeInput are also used by the emerging topics service (candidate decisions) — keep them stable.

export type DraftChangeType = 'Added' | 'Renamed' | 'Moved' | 'Merged';

export interface DraftChange {
  id: string;
  type: DraftChangeType;
  /** "Wire fees & limits → Wire fees and transfer limits" */
  title: string;
  detail: string;
  /** Human-readable impact, e.g. "412 notes now marked “No suitable topic” would be assigned". */
  affected: string;
  /** Notes reassigned to a different topic (last 90 days). 0 for renames. */
  affectedNotes: number;
  author: string;
  authorId: string;
  reason: string;
  /** Only the author can edit or remove a change. Computed per request. */
  editable: boolean;
  createdAt: string;
  /** Subtopic the change applies to (Renamed/Moved/Merged). */
  subId?: string;
  /** Top-level topic being renamed, or the parent of an added subtopic. */
  parentId?: string;
  /** Candidate topic this change came from (Added/Merged from Emerging topics). */
  candidateId?: string;
  newName?: string;
  newParentId?: string;
  targetSubId?: string;
}

export type DraftChangeInput = Omit<DraftChange, 'id' | 'author' | 'authorId' | 'editable' | 'createdAt'>;

/** Body of POST /api/drafts (editors). */
export interface DraftChangeRequest {
  type: 'Renamed' | 'Moved' | 'Merged';
  /** Subtopic to change. Use parentId instead to rename a top-level topic. */
  subId?: string;
  parentId?: string;
  newName?: string;
  newParentId?: string;
  targetSubId?: string;
  reason: string;
}

export interface DraftsResponse {
  basedOn: string;
  changes: DraftChange[];
  summary: { total: number; added: number; renamed: number; moved: number; merged: number; notesReassigned: number };
  /** Why publishing is blocked right now, or null when it's allowed. */
  publishBlockedReason: string | null;
  /** Support notes in the last 90 days, for the "reprocess" option. */
  reprocessEstimate: number;
}

export type TopicStatusKind = 'active' | 'renamed' | 'moved' | 'merging' | 'new' | 'looksAlike';

export interface TreeSubtopic {
  id: string;
  name: string;
  notes: number;
  status: string;
  statusKind: TopicStatusKind;
  note: string | null;
  /** Set for a subtopic added from Emerging topics (not in the published taxonomy yet). */
  candidateId?: string;
  draftOnly?: boolean;
}

export interface TreeParent {
  id: string;
  name: string;
  team: string;
  teamLabel: string;
  notes: number;
  status: string;
  statusKind: TopicStatusKind;
  note: string | null;
  subtopics: TreeSubtopic[];
}

export interface TaxonomyTreeResponse {
  version: string;
  span: string;
  /** "Notes: all teams, Oct 9 – Nov 7, 2026" */
  notesLabel: string;
  parents: TreeParent[];
  matchCount: number;
}

export interface TopicNoteRef {
  id: string;
  date: string;
  excerpt: string;
}

export interface TaxonomyTopicDetail {
  id: string;
  kind: 'parent' | 'subtopic';
  name: string;
  path: string;
  parentId: string | null;
  parentName: string | null;
  team: string;
  teamLabel: string;
  definition: string;
  span: string;
  notesInRange: number;
  notes90: number;
  subtopicCount: number | null;
  status: string;
  statusKind: TopicStatusKind;
  similar: { id: string; name: string; similarity: number } | null;
  notes: TopicNoteRef[];
  /** True when representative notes are hidden because the user can't read this team's notes. */
  notesHidden: boolean;
  pendingChanges: DraftChange[];
  actions: { rename: boolean; move: boolean; compare: boolean; merge: boolean };
  moveOptions: { id: string; name: string }[];
  mergeOptions: { id: string; label: string }[];
}

export interface CompareSide {
  id: string;
  name: string;
  parentName: string;
  notes: number;
  definition: string;
  sampleNotes: TopicNoteRef[];
}

export interface CompareResponse {
  a: CompareSide;
  b: CompareSide;
  similarity: number;
  disclaimer: string;
}

export type VersionState = 'draft' | 'preparing' | 'ready' | 'active' | 'failed' | 'previous';

export interface PrepStep {
  label: string;
  state: 'done' | 'running' | 'waiting' | 'failed';
  at: string | null;
}

export interface ReleaseInfo {
  id: string;
  state: 'preparing' | 'ready' | 'active' | 'failed';
  publishedAt: string;
  publishedBy: string;
  changeCount: number;
  historical: 'keep' | 'reprocess';
  steps: PrepStep[];
  error: { code: string; message: string } | null;
  activatedAt: string | null;
}

export interface VersionRecord {
  id: string;
  state: VersionState;
  publishedAt: string | null;
  publishedBy: string | null;
  summary: string;
  log: string[];
}

export interface VersionsResponse {
  activeVersion: string;
  release: ReleaseInfo | null;
  versions: VersionRecord[];
  draftCount: number;
}

export interface PublishRequest {
  historical: 'keep' | 'reprocess';
}
