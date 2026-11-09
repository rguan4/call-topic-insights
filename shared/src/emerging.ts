// Emerging topics, candidates and background tasks contracts. Owner: emerging topics service.

export type CandidateStatus = 'review' | 'draft' | 'merged' | 'dismissed';
export type CandidateAction = 'add' | 'merge' | 'dismiss';

export interface CandidateNote {
  id: string;
  date: string;
  time: string;
  excerpt: string;
}

export interface ClosestTopic {
  subId: string;
  name: string;
  parentId: string;
  parentName: string;
  /** 0–1. A review signal, not the probability that merging is correct. */
  similarity: number;
}

export interface CandidateSummary {
  id: string;
  name: string;
  description: string;
  /** Notes with no suitable topic that belong to this candidate. */
  notes: number;
  /** "Oct 22 – Nov 7, 2026" */
  range: string;
  suggestedParentId: string;
  suggestedParentName: string;
  trend: 'Growing' | 'Steady' | 'New';
  status: CandidateStatus;
  /** "Needs review", "In draft v8", "Merge in draft v8", "Dismissed" */
  statusLabel: string;
  /** First representative note, for the card quote. */
  sample: string;
}

export interface CandidateDecision {
  action: CandidateAction;
  by: string;
  at: string;
  /** Dismiss reason (+ optional comment). */
  reason: string | null;
  draftChangeId: string | null;
  /** Human-readable summary of the decision. */
  text: string;
}

export interface CandidateDetail extends CandidateSummary {
  closest: ClosestTopic[];
  representativeNotes: CandidateNote[];
  decision: CandidateDecision | null;
  /** Parent topics a new subtopic can be added under. */
  parents: { id: string; name: string }[];
}

export interface CandidateDecisionRequest {
  action: CandidateAction;
  name?: string;
  description?: string;
  parentId?: string;
  targetSubId?: string;
  reason?: string;
  comment?: string;
}

export interface CandidateDecisionResponse {
  candidate: CandidateDetail;
  message: string;
  draftChangeId: string | null;
}

export type TaskKind = 'classify' | 'discovery';
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface TaskInfo {
  id: string;
  kind: TaskKind;
  title: string;
  status: TaskStatus;
  /** 0–100 */
  progress: number;
  meta: string;
  time: string;
  error: { code: string; message: string; attempts: string; affected: string; hint: string } | null;
  retryable: boolean;
}

export interface EmergingResponse {
  /** Emerging topics are company-wide; team filters don't apply. */
  companyWide: true;
  range: string;
  span: string;
  pendingClassification: number;
  processingFailed: number;
  noSuitableTopic: number;
  noSuitableTopicPct: number;
  totalNotes: number;
  thresholdPct: number;
  candidates: CandidateSummary[];
  tasks: TaskInfo[];
  discoveryRunning: boolean;
}
