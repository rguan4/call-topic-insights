import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CandidateDecisionResponse, CandidateDetail, EmergingResponse, TaskInfo } from '@cti/shared';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';
import { resetState } from '../src/data/state';
import { draftChanges, notifyDraftChangeRemoved } from '../src/services/labels';
import { candidatesNeedingReview } from '../src/services/emerging';

const app = createApp();
const editor = { Authorization: `Bearer ${issueToken('alex').token}` };
const viewer = { Authorization: `Bearer ${issueToken('jordan').token}` };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForTask(id: string, status: string): Promise<TaskInfo> {
  for (let i = 0; i < 200; i++) {
    const tasks = (await request(app).get('/api/tasks').set(editor)).body as TaskInfo[];
    const t = tasks.find((x) => x.id === id);
    if (t?.status === status) return t;
    await wait(10);
  }
  throw new Error(`task ${id} never reached ${status}`);
}

beforeEach(() => resetState());

describe('GET /api/emerging', () => {
  it('returns company-wide counts with denominators', async () => {
    const res = await request(app).get('/api/emerging').set(editor);
    const body = res.body as EmergingResponse;
    expect(res.status).toBe(200);
    expect(body.companyWide).toBe(true);
    expect(body.pendingClassification).toBe(214);
    expect(body.processingFailed).toBe(37);
    expect(body.noSuitableTopic).toBe(1437);
    expect(body.totalNotes).toBe(18420);
    expect(body.noSuitableTopicPct).toBe(7.8);
    expect(body.thresholdPct).toBe(5);
    expect(body.candidates.map((c) => c.id)).toEqual(['bond', 'paper']);
    expect(body.tasks.map((t) => t.status)).toEqual(['failed', 'completed']);
    expect(candidatesNeedingReview()).toBe(2);
  });

  it('is readable by viewers (company-wide) but not writable', async () => {
    expect((await request(app).get('/api/emerging').set(viewer)).status).toBe(200);
    expect((await request(app).get('/api/candidates/bond').set(viewer)).status).toBe(200);
    expect((await request(app).post('/api/candidates/bond/decision').set(viewer).send({ action: 'dismiss', reason: 'Other' })).status).toBe(403);
    expect((await request(app).post('/api/tasks/task-1/retry').set(viewer)).status).toBe(403);
    expect((await request(app).post('/api/discovery/run').set(viewer)).status).toBe(403);
  });

  it('validates the range', async () => {
    expect((await request(app).get('/api/emerging?range=1y').set(editor)).status).toBe(400);
  });
});

describe('candidate decisions', () => {
  it('returns candidate detail with closest topics and notes', async () => {
    const body = (await request(app).get('/api/candidates/bond').set(editor)).body as CandidateDetail;
    expect(body.name).toBe('Bond ladder setup questions');
    expect(body.suggestedParentName).toBe('Investing & portfolio questions');
    expect(body.closest[0]).toMatchObject({ subId: 'bond-port', similarity: 0.84 });
    expect(body.representativeNotes[0].id).toBe('SN-731204');
    // Representative notes open in the shared drawer.
    const note = await request(app).get('/api/notes/SN-731204').set(editor);
    expect(note.status).toBe(200);
    expect(note.body.topicPath).toBe('No suitable topic (candidate: Bond ladder setup questions)');
  });

  it('add creates a draft change; removing it resets the candidate', async () => {
    const res = await request(app).post('/api/candidates/bond/decision').set(editor).send({ action: 'add', name: 'Bond ladder setup questions', parentId: 'invest' });
    const body = res.body as CandidateDecisionResponse;
    expect(res.status).toBe(200);
    expect(body.candidate.status).toBe('draft');
    const change = draftChanges().find((c) => c.candidateId === 'bond');
    expect(change).toMatchObject({ type: 'Added', parentId: 'invest', affectedNotes: 412 });
    expect(candidatesNeedingReview()).toBe(1);
    expect((await request(app).post('/api/candidates/bond/decision').set(editor).send({ action: 'dismiss', reason: 'Other' })).status).toBe(409);

    notifyDraftChangeRemoved(change!);
    const after = (await request(app).get('/api/candidates/bond').set(editor)).body as CandidateDetail;
    expect(after.status).toBe('review');
    expect(after.decision).toBeNull();
  });

  it('merge needs a target and creates a Merged change', async () => {
    expect((await request(app).post('/api/candidates/paper/decision').set(editor).send({ action: 'merge' })).status).toBe(400);
    const res = await request(app).post('/api/candidates/paper/decision').set(editor).send({ action: 'merge', targetSubId: 'stmt-download' });
    expect((res.body as CandidateDecisionResponse).candidate.statusLabel).toBe('Merge in draft v8');
    expect(draftChanges().find((c) => c.candidateId === 'paper')).toMatchObject({ type: 'Merged', targetSubId: 'stmt-download' });
  });

  it('dismiss requires a reason', async () => {
    expect((await request(app).post('/api/candidates/paper/decision').set(editor).send({ action: 'dismiss' })).status).toBe(400);
    const res = await request(app).post('/api/candidates/paper/decision').set(editor).send({ action: 'dismiss', reason: 'Too few notes to act on', comment: 'revisit in Q1' });
    const body = res.body as CandidateDecisionResponse;
    expect(body.candidate.status).toBe('dismissed');
    expect(body.candidate.decision?.reason).toBe('Too few notes to act on · revisit in Q1');
    expect(draftChanges().some((c) => c.candidateId === 'paper')).toBe(false);
  });
});

describe('background tasks', () => {
  it('retrying the failed batch completes and updates counts', async () => {
    const res = await request(app).post('/api/tasks/task-1/retry').set(editor);
    expect(res.status).toBe(202);
    expect((res.body as TaskInfo).status).toBe('queued');
    const done = await waitForTask('task-1', 'completed');
    expect(done.meta).toBe('Reprocessed 37 notes: 29 assigned to topics, 8 with no suitable topic');
    const body = (await request(app).get('/api/emerging').set(editor)).body as EmergingResponse;
    expect(body.processingFailed).toBe(0);
    expect(body.noSuitableTopic).toBe(1445);
    expect((await request(app).post('/api/tasks/task-1/retry').set(editor)).status).toBe(409);
  });

  it('discovery creates the bill pay candidate once', async () => {
    const run = await request(app).post('/api/discovery/run').set(editor);
    expect(run.status).toBe(202);
    expect((await request(app).post('/api/discovery/run').set(editor)).status).toBe(409);
    const first = await waitForTask((run.body as TaskInfo).id, 'completed');
    expect(first.meta).toBe('Found 1 new candidate topic for review');
    expect(candidatesNeedingReview()).toBe(3);

    const again = await request(app).post('/api/discovery/run').set(editor);
    const second = await waitForTask((again.body as TaskInfo).id, 'completed');
    expect(second.meta).toBe('No new candidates; existing candidates refreshed');
    const body = (await request(app).get('/api/emerging').set(editor)).body as EmergingResponse;
    expect(body.candidates.map((c) => c.id)).toEqual(['bond', 'paper', 'billpay']);
  });

  it('can simulate a discovery failure that is retryable', async () => {
    process.env.CTI_DISCOVERY_FAIL = '1';
    try {
      const run = await request(app).post('/api/discovery/run').set(editor);
      const failed = await waitForTask((run.body as TaskInfo).id, 'failed');
      expect(failed.error?.code).toBe('DSC-118');
      expect(failed.retryable).toBe(true);
      delete process.env.CTI_DISCOVERY_FAIL;
      await request(app).post(`/api/tasks/${failed.id}/retry`).set(editor);
      await waitForTask(failed.id, 'completed');
    } finally {
      delete process.env.CTI_DISCOVERY_FAIL;
    }
  });
});
