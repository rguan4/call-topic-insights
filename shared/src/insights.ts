// AI Topic Insights contracts. Owner: AI insights service.
import type { RangeKey, TeamScope } from './index';

export interface InsightScopeInput {
  topicId: string;
  /** Subtopic ID, or 'all' for the whole topic. */
  subId: string;
  range: RangeKey;
  version: string;
  team: TeamScope;
}

export type InsightStatus = 'running' | 'completed' | 'insufficient' | 'failed';

export interface InsightScope extends InsightScopeInput {
  topicName: string;
  subName: string | null;
  /** "Wires and funding methods › Wire transfers & real estate" or "… (all subtopics)" */
  topicLabel: string;
  span: string;
  rangeLabel: string;
  teamLabel: string;
  ownerTeamLabel: string;
  /** Notes in scope and how many were analyzed. */
  totalNotes: number;
  analyzedNotes: number;
  sampled: boolean;
  /** "400 sampled of 1,120 support notes" or "All 212 support notes" */
  notesLabel: string;
}

export interface InsightSourceNote {
  id: string;
  date: string;
  excerpt: string;
}

export interface InsightIssue {
  title: string;
  /** Notes in the analyzed set that mention this issue. */
  count: number;
  /** Rounded percent of analyzed notes. */
  pct: number;
  /** "41% of 400 sampled notes" */
  shareLabel: string;
  sources: InsightSourceNote[];
  /** Number of supporting note IDs (see GET /api/notes?insight=&issue=). */
  supportingCount: number;
}

export interface InsightResult {
  id: string;
  status: InsightStatus;
  /** 0 sampling, 1 finding issues, 2 linking notes, 3 done */
  step: number;
  scope: InsightScope;
  createdAt: string;
  summary?: string;
  issues?: InsightIssue[];
  hypotheses?: string[];
  generatedAt?: string;
  durationLabel?: string;
  model?: string;
  error?: { code: string; message: string; ref: string };
  feedback?: { helpful: boolean | null; reportRef: string | null };
}

export interface InsightFeedbackRequest {
  helpful: boolean;
}

export interface InsightReportRequest {
  reason: string;
  details?: string;
}
