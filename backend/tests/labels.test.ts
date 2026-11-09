import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftChange, DraftsResponse, MetaResponse, ReleaseInfo, TaxonomyTreeResponse, TaxonomyTopicDetail, VersionsResponse } from '@cti/shared';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';
import { resetState } from '../src/data/state';
import { SUB, subName } from '../src/data/catalog';
import { addDraftChange, onDraftChangeRemoved } from '../src/services/labels';
import { USERS } from '../src/auth';

const app = createApp();
const editor = { Authorization: `Bearer ${issueToken('alex').token}` };
const viewer = { Authorization: `Bearer ${issueToken('jordan').token}` };

async function waitFor(state: string): Promise<VersionsResponse> {
  for (let i = 0; i < 100; i++) {
    const res = await request(app).get('/api/versions').set(editor);
    const body = res.body as VersionsResponse;
    if (body.release?.state === state) return body;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`release never reached ${state}`);
}

beforeEach(() => {
  resetState();
});
afterEach(() => {
  delete process.env.CTI_PREP_FAIL;
});

describe('taxonomy tree', () => {
  it('lists every team, seeded draft rename and the looks-alike pair', async () => {
    const res = await request(app).get('/api/taxonomy/tree?range=30d').set(viewer);
    const body = res.body as TaxonomyTreeResponse;
    expect(res.status).toBe(200);
    expect(body.parents).toHaveLength(9);
    expect(body.notesLabel).toBe('Notes: all teams, Oct 9 – Nov 7, 2026');
    const wires = body.parents.find((p) => p.id === 'wires')!;
    expect(wires.notes).toBe(2940);
    expect(wires.subtopics.find((s) => s.id === 'wire-fees')).toMatchObject({ statusKind: 'renamed' });
    const check = body.parents.find((p) => p.id === 'check')!;
    expect(check.subtopics.find((s) => s.id === 'check-rollover')?.statusKind).toBe('looksAlike');
  });

  it('counts do not depend on the user team', async () => {
    const a = (await request(app).get('/api/taxonomy/tree').set(editor)).body as TaxonomyTreeResponse;
    const b = (await request(app).get('/api/taxonomy/tree').set(viewer)).body as TaxonomyTreeResponse;
    expect(a.parents.map((p) => p.notes)).toEqual(b.parents.map((p) => p.notes));
  });

  it('filters by search text', async () => {
    const body = (await request(app).get('/api/taxonomy/tree?q=rollover').set(editor)).body as TaxonomyTreeResponse;
    expect(body.parents.map((p) => p.id).sort()).toEqual(['check', 'ira']);
    expect(body.matchCount).toBeGreaterThanOrEqual(3);
  });

  it('returns topic details and hides notes outside the viewer team', async () => {
    const ed = (await request(app).get('/api/taxonomy/topics/check-rollover').set(editor)).body as TaxonomyTopicDetail;
    expect(ed.similar).toMatchObject({ id: 'rollover-checks', similarity: 0.91 });
    expect(ed.notes).toHaveLength(2);
    const vw = (await request(app).get('/api/taxonomy/topics/rollover-checks').set(viewer)).body as TaxonomyTopicDetail;
    expect(vw.notesHidden).toBe(true);
    const parent = (await request(app).get('/api/taxonomy/topics/wires').set(editor)).body as TaxonomyTopicDetail;
    expect(parent.actions).toEqual({ rename: true, move: false, compare: false, merge: false });
    expect((await request(app).get('/api/taxonomy/topics/nope').set(editor)).status).toBe(404);
  });

  it('compares two subtopics', async () => {
    const res = await request(app).get('/api/taxonomy/compare?a=check-rollover&b=rollover-checks').set(editor);
    expect(res.body.similarity).toBe(0.91);
    expect(res.body.disclaimer).toMatch(/not the probability/);
    expect((await request(app).get('/api/taxonomy/compare?a=roth&b=401k').set(editor)).body.similarity).toBe(0.62);
    expect((await request(app).get('/api/taxonomy/compare?a=roth&b=roth').set(editor)).status).toBe(400);
  });
});

describe('drafts', () => {
  it('starts with Priya’s rename, not editable by others', async () => {
    const body = (await request(app).get('/api/drafts').set(editor)).body as DraftsResponse;
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({ author: 'Priya S.', editable: false });
    expect(body.publishBlockedReason).toBeNull();
    const del = await request(app).delete(`/api/drafts/${body.changes[0].id}`).set(editor);
    expect(del.status).toBe(403);
  });

  it('validates rename, move and merge', async () => {
    const post = (b: object) => request(app).post('/api/drafts').set(editor).send(b);
    expect((await post({ type: 'Renamed', subId: 'roth', newName: 'Roth', reason: '' })).status).toBe(400);
    expect((await post({ type: 'Renamed', subId: 'roth', newName: 'Roth conversions', reason: 'x' })).body.error.code).toBe('same_name');
    expect((await post({ type: 'Moved', subId: 'roth', newParentId: 'ira', reason: 'x' })).body.error.code).toBe('same_parent');
    expect((await post({ type: 'Merged', subId: 'roth', targetSubId: 'roth', reason: 'x' })).body.error.code).toBe('same_topic');
    const ren = await post({ type: 'Renamed', subId: 'roth', newName: 'Roth IRA conversions', reason: 'Clearer' });
    expect(ren.status).toBe(201);
    const mv = await post({ type: 'Moved', subId: 'risk', newParentId: 'ira', reason: 'Belongs with IRA' });
    expect(mv.body).toMatchObject({ type: 'Moved', affectedNotes: expect.any(Number) });
    const mg = await post({ type: 'Merged', subId: 'check-rollover', targetSubId: 'rollover-checks', reason: 'Same issue' });
    expect(mg.body.title).toBe('Check rollovers → Rollover checks');
    // Same type + topic replaces the previous change.
    await post({ type: 'Renamed', subId: 'roth', newName: 'Roth IRA conversion questions', reason: 'Better' });
    const drafts = (await request(app).get('/api/drafts').set(editor)).body as DraftsResponse;
    expect(drafts.changes.filter((c) => c.subId === 'roth')).toHaveLength(1);
    expect(drafts.summary).toMatchObject({ total: 4, renamed: 2, moved: 1, merged: 1 });
    // Merging the pair clears the looks-alike flag.
    const tree = (await request(app).get('/api/taxonomy/tree').set(editor)).body as TaxonomyTreeResponse;
    const ira = tree.parents.find((p) => p.id === 'ira')!;
    expect(ira.subtopics.find((s) => s.id === 'rollover-checks')?.statusKind).toBe('active');
    expect(ira.subtopics.find((s) => s.id === 'risk')?.statusKind).toBe('moved');
  });

  it('only lets editors write and only the author edit or remove', async () => {
    expect((await request(app).post('/api/drafts').set(viewer).send({ type: 'Renamed', subId: 'roth', newName: 'A', reason: 'b' })).status).toBe(403);
    const c = (await request(app).post('/api/drafts').set(editor).send({ type: 'Renamed', subId: 'apy', newName: 'APY and interest rates', reason: 'x' })).body as DraftChange;
    expect(c.editable).toBe(true);
    const patched = await request(app).patch(`/api/drafts/${c.id}`).set(editor).send({ reason: 'Clients ask about rates too' });
    expect(patched.body.reason).toBe('Clients ask about rates too');
    expect((await request(app).delete(`/api/drafts/${c.id}`).set(viewer)).status).toBe(403);
  });

  it('notifies listeners when a change is removed', async () => {
    const seen = vi.fn();
    onDraftChangeRemoved(seen);
    const added = addDraftChange({ type: 'Added', parentId: 'invest', candidateId: 'bond', newName: 'Bond ladder setup questions', title: 'Bond ladder setup questions', detail: 'x', affected: 'y', affectedNotes: 412, reason: 'r' }, USERS.alex);
    const tree = (await request(app).get('/api/taxonomy/tree').set(editor)).body as TaxonomyTreeResponse;
    expect(tree.parents.find((p) => p.id === 'invest')?.subtopics.some((s) => s.candidateId === 'bond')).toBe(true);
    expect((await request(app).delete(`/api/drafts/${added.id}`).set(editor)).status).toBe(204);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ candidateId: 'bond' }));
  });

  it('requires a reason before publishing', async () => {
    addDraftChange({ type: 'Merged', candidateId: 'paper', targetSubId: 'stmt-download', title: 'Paper → Statement downloads', detail: 'x', affected: 'y', affectedNotes: 168, reason: '' }, USERS.alex);
    const body = (await request(app).get('/api/drafts').set(editor)).body as DraftsResponse;
    expect(body.publishBlockedReason).toBe('Add a reason for every change.');
    expect((await request(app).post('/api/versions/publish').set(editor).send({ historical: 'keep' })).status).toBe(409);
  });
});

describe('publish and activate', () => {
  it('publishes v8, prepares it and activates it', async () => {
    const pub = await request(app).post('/api/versions/publish').set(editor).send({ historical: 'keep' });
    expect(pub.status).toBe(201);
    expect((pub.body as ReleaseInfo).id).toBe('v8');
    expect((await request(app).get('/api/drafts').set(editor)).body.changes).toHaveLength(0);
    // Blocked while a release is in progress.
    await request(app).post('/api/drafts').set(editor).send({ type: 'Renamed', subId: 'apy', newName: 'APY and rates', reason: 'x' });
    expect((await request(app).post('/api/versions/publish').set(editor).send({})).status).toBe(409);
    // Not activatable until ready.
    const ready = await waitFor('ready');
    expect(ready.release?.steps.every((s) => s.state === 'done')).toBe(true);
    expect(ready.versions[0]).toMatchObject({ id: 'v8', state: 'ready' });
    expect((await request(app).post('/api/versions/v8/activate').set(viewer)).status).toBe(403);
    const act = await request(app).post('/api/versions/v8/activate').set(editor);
    expect(act.body.state).toBe('active');
    const meta = (await request(app).get('/api/meta').set(editor)).body as MetaResponse;
    expect(meta.activeVersion).toBe('v8');
    expect(meta.selectableVersions.map((v) => v.id)).toEqual(expect.arrayContaining(['v8', 'v7']));
    expect(subName(SUB['wire-fees'], 'v8')).toBe('Wire fees and transfer limits');
    expect(subName(SUB['wire-fees'], 'v7')).toBe('Wire fees & limits');
    // v7 data stays readable.
    expect((await request(app).get('/api/overview?version=v7').set(editor)).status).toBe(200);
  });

  it('shows a failed preparation and retries it', async () => {
    process.env.CTI_PREP_FAIL = '1';
    await request(app).post('/api/versions/publish').set(editor).send({ historical: 'reprocess' });
    const failed = await waitFor('failed');
    expect(failed.release?.error?.code).toBe('PRP-207');
    expect(failed.release?.steps.map((s) => s.state)).toEqual(['done', 'failed', 'waiting']);
    expect((await request(app).post('/api/versions/v8/activate').set(editor)).status).toBe(409);
    const retry = await request(app).post('/api/versions/v8/retry-preparation').set(editor);
    expect(retry.status).toBe(200);
    const ready = await waitFor('ready');
    expect(ready.release?.historical).toBe('reprocess');
  });
});
