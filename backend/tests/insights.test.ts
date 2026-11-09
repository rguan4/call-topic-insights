import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { InsightResult, NoteDetail } from '@cti/shared';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';
import { SUB, templatesOf } from '../src/data/catalog';
import { notesOf } from '../src/data/notes';
import { findingNoteIds } from '../src/services/insights';

const app = createApp();
const editor = { Authorization: `Bearer ${issueToken('alex').token}` };
const viewer = { Authorization: `Bearer ${issueToken('jordan').token}` };

async function generate(body: object, auth = editor): Promise<InsightResult> {
  const start = await request(app).post('/api/insights').set(auth).send(body);
  expect(start.status).toBe(202);
  expect((start.body as InsightResult).status).toBe('running');
  const id = (start.body as InsightResult).id;
  for (let i = 0; i < 100; i++) {
    const r = await request(app).get(`/api/insights/${id}`).set(auth);
    if ((r.body as InsightResult).status !== 'running') return r.body as InsightResult;
    await new Promise((res) => setTimeout(res, 10));
  }
  throw new Error('insight did not finish');
}

const base = { topicId: 'wires', subId: 'wire-re', range: '30d', version: 'v7', team: 'all' };

describe('AI insights', () => {
  it('completes with sampled scope and exact shares', async () => {
    const r = await generate(base);
    expect(r.status).toBe('completed');
    expect(r.scope.totalNotes).toBe(1120);
    expect(r.scope.analyzedNotes).toBe(400);
    expect(r.scope.notesLabel).toBe('400 sampled of 1,120 support notes');
    expect(r.model).toBe('rule-based');
    expect(r.summary).toMatch(/escrow/);
    expect(r.hypotheses).toHaveLength(2);
    expect(r.issues).toHaveLength(3);

    // Recompute the first issue independently.
    const pool = notesOf(SUB['wire-re']).filter((n) => n.off < 30);
    const sample = Array.from({ length: 400 }, (_, j) => pool[Math.floor((j * pool.length) / 400)]);
    const themes = templatesOf(SUB['wire-re']).map((t) => t[1]);
    const first = r.issues![0];
    const ti = themes.indexOf(first.title);
    const count = sample.filter((n) => n.tags.includes(ti)).length;
    expect(first.count).toBe(count);
    expect(first.pct).toBe(Math.round((count / 400) * 100));
    expect(first.shareLabel).toBe(`${first.pct}% of 400 sampled notes`);
    expect(first.sources).toHaveLength(3);
    // Issues are sorted by size.
    expect(r.issues![0].count).toBeGreaterThanOrEqual(r.issues![1].count);
  });

  it('groups by subtopic for the whole topic', async () => {
    const r = await generate({ ...base, subId: 'all' });
    expect(r.status).toBe('completed');
    expect(r.scope.topicLabel).toBe('Wires and funding methods (all subtopics)');
    expect(r.issues!.map((i) => i.title)).toEqual(['Wire transfers & real estate', 'Wire status & processing updates', 'Third-party wires']);
    const sum = r.issues!.reduce((a, i) => a + i.count, 0);
    expect(sum).toBeLessThanOrEqual(400);
  });

  it('reports insufficient evidence for small scopes', async () => {
    const r = await generate({ ...base, subId: 'wire-intl', range: '7d' });
    expect(r.status).toBe('insufficient');
    expect(r.scope.totalNotes).toBeLessThan(40);
    expect(r.issues).toBeUndefined();
  });

  it('blocks viewers from other teams', async () => {
    const res = await request(app).post('/api/insights').set(viewer).send({ topicId: 'tax', subId: 'tax-1099', range: '30d', version: 'v7', team: 'money' });
    expect(res.status).toBe(403);
    const ok = await generate({ ...base, team: 'money' }, viewer);
    expect(ok.status).toBe('completed');
  });

  it('validates the scope', async () => {
    expect((await request(app).post('/api/insights').set(editor).send({ ...base, topicId: 'nope' })).status).toBe(404);
    expect((await request(app).post('/api/insights').set(editor).send({ ...base, subId: 'tax-1099' })).status).toBe(404);
    expect((await request(app).post('/api/insights').set(editor).send({ ...base, range: '1y' })).status).toBe(400);
  });

  it('exposes supporting note IDs that resolve to real notes', async () => {
    const r = await generate(base);
    const f = findingNoteIds(r.id, 0);
    expect(f?.title).toBe(r.issues![0].title);
    expect(f?.ids).toHaveLength(r.issues![0].count);
    expect(f?.ids.slice(0, 3)).toEqual(r.issues![0].sources.map((s) => s.id));
    const note = await request(app).get(`/api/notes/${f!.ids[5]}`).set(editor);
    expect(note.status).toBe(200);
    expect((note.body as NoteDetail).subId).toBe('wire-re');
    expect(findingNoteIds(r.id, 9)).toBeNull();
    expect(findingNoteIds('missing', 0)).toBeNull();
  });

  it('returns the latest result for a topic', async () => {
    const a = await generate({ ...base, subId: 'wire-status', range: '7d' });
    const b = await generate({ ...base, subId: 'wire-status', range: '90d' });
    const latest = await request(app).get('/api/insights/latest?topicId=wires&subId=wire-status').set(editor);
    expect((latest.body as InsightResult).id).toBe(b.id);
    expect(a.id).not.toBe(b.id);
    expect((await request(app).get('/api/insights/latest?topicId=wires&subId=wire-in').set(editor)).status).toBe(404);
  });

  it('stores feedback and reports', async () => {
    const r = await generate(base);
    const fb = await request(app).post(`/api/insights/${r.id}/feedback`).set(editor).send({ helpful: true });
    expect((fb.body as InsightResult).feedback).toEqual({ helpful: true, reportRef: null });
    const bad = await request(app).post(`/api/insights/${r.id}/reports`).set(editor).send({ reason: 'nope' });
    expect(bad.status).toBe(400);
    const rep = await request(app).post(`/api/insights/${r.id}/reports`).set(editor).send({ reason: 'Important issue missing', details: 'x' });
    expect(rep.status).toBe(201);
    expect(rep.body.ref).toMatch(/^RPT-AI-/);
    expect(rep.body.result.feedback.reportRef).toBe(rep.body.ref);
  });

  it('fails cleanly when the analysis service fails', async () => {
    process.env.CTI_AI_FAIL = '1';
    try {
      const r = await generate(base);
      expect(r.status).toBe('failed');
      expect(r.error?.code).toBe('AI-5023');
      expect(r.error?.ref).toMatch(/^AI-/);
    } finally {
      delete process.env.CTI_AI_FAIL;
    }
  });
});

describe('scope preview', () => {
  it('describes the scope without creating a job', async () => {
    const res = await request(app).get('/api/insights/scope?topicId=wires&subId=wire-re&range=30d').set(editor);
    expect(res.status).toBe(200);
    expect(res.body.notesLabel).toBe('400 sampled of 1,120 support notes');
    expect(res.body.version).toBe('v7');
    const small = await request(app).get('/api/insights/scope?topicId=wires&subId=wire-intl&range=7d').set(editor);
    expect(small.body.notesLabel).toMatch(/^All \d+ support notes$/);
  });
});
