// Notes, topics and search contracts. Owner: notes/topics service.
// The note detail and report types below are used by the shared note drawer — keep them stable.

export type ClassificationStatus = 'Classified' | 'Low confidence' | 'Reported' | 'No suitable topic';

export interface NoteRow {
  id: string;
  date: string;
  time: string;
  topicId: string | null;
  subId: string | null;
  topicName: string;
  subName: string;
  status: ClassificationStatus;
  excerpt: string;
}

export interface NoteDetail extends NoteRow {
  full: string;
  dateTime: string;
  /** "Wires and funding methods › Wire transfers & real estate" */
  topicPath: string;
  version: string;
  confidence: number | null;
  /** Handling (resolution) status, separate from the topic. */
  handling: string;
  report: { ref: string; reason: string; at: string } | null;
  canReport: boolean;
}

export interface ReportRequest {
  reason: string;
  suggestedSubId?: string | null;
  comment?: string;
}

// ---------------------------------------------------------------------------
// Topics, notes list, search, exports, digests (owner: notes/topics service)
// ---------------------------------------------------------------------------
import type { ScopeInfo, TeamId, TopicSummary } from './index';

export type TopicSort = 'notes' | 'change' | 'name';

export interface TopicsResponse {
  scope: ScopeInfo;
  /** Support notes in the current team scope (denominator for sharePct). */
  scopeNotes: number;
  /** Topics in scope before the text search. */
  totalTopics: number;
  q: string;
  sort: TopicSort;
  topics: TopicSummary[];
}

export interface SubtopicCard {
  id: string;
  name: string;
  notes: number;
  prevNotes: number;
  changePct: number;
  /** Percent of the parent topic's notes. */
  sharePct: number;
}

export interface TrendPoint {
  label: string;
  tooltip: string;
}

export interface TopicTrend {
  unit: string;
  xUnit: string;
  periodHeader: string;
  points: TrendPoint[];
  /** Selected subtopic, or null when the scope is the whole topic. */
  sub: number[] | null;
  parent: number[];
}

export interface DigestStatus {
  subscribed: boolean;
  frequency: 'weekly' | 'daily' | null;
  firstSend: string | null;
}

export interface TopicDetailResponse {
  scope: ScopeInfo;
  topic: {
    id: string;
    name: string;
    team: TeamId;
    teamLabel: string;
    notes: number;
    prevNotes: number;
    changePct: number;
    /** Percent of every support note company-wide in the range. */
    sharePctOfCompany: number;
    companyNotes: number;
  };
  /** Selected subtopic, or null for "all subtopics". */
  sub: { id: string; name: string; notes: number; prevNotes: number; changePct: number; sharePctOfTopic: number } | null;
  subtopics: SubtopicCard[];
  /** Notes in the current scope (sub or whole topic). */
  scopeNotes: number;
  /** Notes closest to the center of the scope. */
  typical: NoteRow[];
  trend: TopicTrend;
  digest: DigestStatus;
}

export type NoteSort = 'newest' | 'oldest' | 'typical';

export interface NotesResponse {
  scope: ScopeInfo;
  topic: { id: string; name: string; team: TeamId };
  /** Current subtopic filter, or null for all subtopics of the topic. */
  sub: { id: string; name: string } | null;
  rows: NoteRow[];
  total: number;
  page: number;
  pages: number;
  per: number;
  /** Date buckets inside the selected range (value = bucket index). */
  dateOptions: { id: string; label: string }[];
  subOptions: { id: string; name: string; notes: number }[];
  /** Notes in the topic for the range, before list filters. */
  topicNotes: number;
  /** AI finding filter, when ?insight=&issue= matched. */
  finding: { title: string; count: number } | null;
}

export interface SearchTopicHit {
  /** Subtopic ID. */
  id: string;
  topicId: string;
  name: string;
  parentName: string;
  team: TeamId;
  teamLabel: string;
  /** True when the topic is outside the user's access (no counts shown). */
  locked: boolean;
  notes: number | null;
  score: number | null;
}

export interface SearchResponse {
  scope: ScopeInfo;
  q: string;
  topics: SearchTopicHit[];
  notes: (NoteRow & { score: number })[];
  /** Matching topics whose notes are hidden because they're outside the user's access. */
  hiddenTopics: number;
}

export interface ExportRequest {
  topicId: string;
  subId: string;
  includeText: boolean;
}

export interface ExportResponse {
  fileName: string;
  rows: number;
  expiresAt: string;
}

export interface DigestRequest {
  topicId: string;
  subId: string;
  frequency: 'weekly' | 'daily';
}
