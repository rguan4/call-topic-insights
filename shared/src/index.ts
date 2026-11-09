// Types shared by the API and the web app. Type-only: nothing here runs.

export type RangeKey = '7d' | '30d' | '90d';
export type TeamId = 'money' | 'tax' | 'access' | 'investing' | 'banking';
export type TeamScope = TeamId | 'all';
export type Role = 'editor' | 'viewer';

export interface User {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  team: string;
  role: Role;
  /** Teams whose data this user can read. 'all' = every team. */
  access: TeamId[] | 'all';
}

export interface Filters {
  range: RangeKey;
  version: string;
  team: TeamScope;
}

export interface ScopeInfo {
  range: RangeKey;
  rangeLabel: string;
  span: string;
  prevSpan: string;
  version: string;
  team: TeamScope;
  teamLabel: string;
  syncedAt: string;
}

export interface VersionInfo {
  id: string;
  status: 'draft' | 'preparing' | 'ready' | 'active' | 'failed' | 'previous';
  publishedAt: string | null;
}

export interface SubtopicOption {
  id: string;
  name: string;
  parentId: string;
  parentName: string;
  team: TeamId;
}

/** POST /api/auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: User;
}

export interface MetaResponse {
  activeVersion: string;
  /** Every subtopic in the active version (for pickers). */
  subtopics: SubtopicOption[];
  /** Sidebar badges. */
  badges: { candidatesNeedingReview: number; draftChanges: number };
  /** Versions that can be selected in the filter bar. */
  selectableVersions: VersionInfo[];
  teams: { id: TeamId; label: string }[];
  ranges: { id: RangeKey; label: string }[];
  syncedAt: string;
}

export interface TopicSummary {
  id: string;
  name: string;
  team: TeamId;
  teamLabel: string;
  subtopicCount: number;
  subtopicNames: string[];
  /** Subtopic with the most notes in scope; where the topic link lands. */
  largestSubId: string;
  notes: number;
  prevNotes: number;
  changePct: number;
  /** Percent of the notes in the current scope. */
  sharePct: number;
}

export interface SubtopicChange {
  id: string;
  parentId: string;
  name: string;
  parentName: string;
  notes: number;
  prevNotes: number;
  changePct: number;
}

export interface HistoricalSeries {
  title: string;
  span: string;
  team: TeamId;
  teamLabel: string;
  unit: string;
  points: { label: string; tooltip: string }[];
  series: { name: string; values: number[] }[];
  markers: { position: number; label: string }[];
  tickIndexes: number[];
}

export interface OverviewResponse {
  scope: ScopeInfo;
  inScope: {
    notes: number;
    prevNotes: number;
    changePct: number;
    topicCount: number;
    topicNote: string;
    fastest: SubtopicChange | null;
  };
  companyWide: {
    totalNotes: number;
    noSuitableTopic: number;
    noSuitableTopicPct: number;
    thresholdPct: number;
    candidatesNeedingReview: number;
  };
  topics: TopicSummary[];
  othersNote: string;
  changes: SubtopicChange[];
  historical: HistoricalSeries | null;
}

export interface ApiError {
  error: { code: string; message: string };
}

export * from './notes';
export * from './insights';
export * from './emerging';
export * from './labels';
