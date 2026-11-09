import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { DigestStatus, ExportResponse, NoteDetail, NotesResponse, SearchResponse, TopicDetailResponse, TopicsResponse } from '@cti/shared';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';

const app = createApp();
const editor = { Authorization: `Bearer ${issueToken('alex').token}` };
const viewer = { Authorization: `Bearer ${issueToken('jordan').token}` };

describe('GET /api/topics', () => {
  it('lists topics in scope with shares of the scope', async () => {
    const res = await request(app).get('/api/topics').set(editor);
    const body = res.body as TopicsResponse;
    expect(res.status).toBe(200);
    expect(body.scopeNotes).toBe(18420);
    expect(body.topics[0]).toMatchObject({ id: 'wires', notes: 2940 });
    expect(body.topics[0].sharePct).toBeCloseTo(16, 0);
  });
  it('filters by team, text and sorts', async () => {
    const team = (await request(app).get('/api/topics?team=money').set(editor)).body as TopicsResponse;
    expect(team.topics.every((t) => t.team === 'money')).toBe(true);
    const q = (await request(app).get('/api/topics?q=escrow').set(editor)).body as TopicsResponse;
    expect(q.topics).toHaveLength(0);
    const q2 = (await request(app).get('/api/topics?q=third-party').set(editor)).body as TopicsResponse;
    expect(q2.topics.map((t) => t.id)).toEqual(['wires']);
    const byName = (await request(app).get('/api/topics?sort=name').set(editor)).body as TopicsResponse;
    expect(byName.topics[0].name).toBe('Account statements & documents');
  });
});

describe('GET /api/topics/:id', () => {
  it('subtopic notes sum to the topic for every range', async () => {
    for (const range of ['7d', '30d', '90d']) {
      const body = (await request(app).get(`/api/topics/wires?range=${range}`).set(editor)).body as TopicDetailResponse;
      expect(body.subtopics.reduce((a, s) => a + s.notes, 0)).toBe(body.topic.notes);
      expect(body.scopeNotes).toBe(body.topic.notes);
      expect(body.trend.parent.reduce((a, v) => a + v, 0)).toBe(body.topic.notes);
    }
  });
  it('returns subtopic scope and trend', async () => {
    const body = (await request(app).get('/api/topics/wires?sub=wire-re').set(editor)).body as TopicDetailResponse;
    expect(body.sub).toMatchObject({ id: 'wire-re', notes: 1120 });
    expect(body.trend.sub?.reduce((a, v) => a + v, 0)).toBe(1120);
    expect(body.trend.points).toHaveLength(30);
    expect(body.typical).toHaveLength(3);
    const weekly = (await request(app).get('/api/topics/wires?sub=wire-re&range=90d').set(editor)).body as TopicDetailResponse;
    expect(weekly.trend.points).toHaveLength(13);
    expect(weekly.trend.unit).toBe('Support notes per week');
  });
  it('404s and 403s', async () => {
    expect((await request(app).get('/api/topics/nope').set(editor)).status).toBe(404);
    expect((await request(app).get('/api/topics/wires?sub=tax-1099').set(editor)).status).toBe(404);
    expect((await request(app).get('/api/topics/tax').set(viewer)).status).toBe(403);
    expect((await request(app).get('/api/topics/wires').set(viewer)).status).toBe(200);
  });
});

describe('GET /api/notes', () => {
  it('total equals the subtopic count for the range', async () => {
    for (const range of ['7d', '30d', '90d']) {
      const detail = (await request(app).get(`/api/topics/wires?sub=wire-re&range=${range}`).set(editor)).body as TopicDetailResponse;
      const list = (await request(app).get(`/api/notes?topic=wires&sub=wire-re&range=${range}`).set(editor)).body as NotesResponse;
      expect(list.total).toBe(detail.sub?.notes);
    }
    const all = (await request(app).get('/api/notes?topic=wires&sub=all').set(editor)).body as NotesResponse;
    expect(all.total).toBe(2940);
    expect(all.topicNotes).toBe(2940);
  });
  it('keeps the same record across pages', async () => {
    const detail = (await request(app).get('/api/topics/wires?sub=wire-re').set(editor)).body as TopicDetailResponse;
    const t = detail.typical[0];
    const list = (await request(app).get(`/api/notes?topic=wires&sub=wire-re&q=${t.id}`).set(editor)).body as NotesResponse;
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toEqual(t);
    const one = (await request(app).get(`/api/notes/${t.id}`).set(editor)).body as NoteDetail;
    expect(one.date).toBe(t.date);
    expect(one.excerpt).toBe(t.excerpt);
    expect(one.subId).toBe('wire-re');
  });
  it('paginates and filters', async () => {
    const p1 = (await request(app).get('/api/notes?topic=wires&sub=wire-re&per=25&page=2').set(editor)).body as NotesResponse;
    expect(p1.rows).toHaveLength(25);
    expect(p1.page).toBe(2);
    expect(p1.pages).toBe(Math.ceil(1120 / 25));
    const low = (await request(app).get('/api/notes?topic=wires&sub=wire-re&status=Low%20confidence').set(editor)).body as NotesResponse;
    expect(low.rows.every((r) => r.status === 'Low confidence')).toBe(true);
    const bucket = (await request(app).get('/api/notes?topic=wires&sub=wire-re&date=0').set(editor)).body as NotesResponse;
    expect(bucket.total).toBeLessThan(1120);
    expect(bucket.dateOptions[0].label).toBe('Nov 1 – Nov 7');
    expect((await request(app).get('/api/notes?topic=wires&sort=bogus').set(editor)).status).toBe(400);
  });
  it('blocks viewers from other teams', async () => {
    expect((await request(app).get('/api/notes?topic=tax').set(viewer)).status).toBe(403);
  });
});

describe('GET /api/search', () => {
  it('requires a query', async () => {
    expect((await request(app).get('/api/search?q=').set(editor)).status).toBe(400);
  });
  it('finds topics and notes by meaning', async () => {
    const body = (await request(app).get('/api/search?q=wire%20to%20escrow').set(editor)).body as SearchResponse;
    expect(body.topics[0].id).toBe('wire-re');
    expect(body.notes.length).toBeGreaterThan(0);
    const none = (await request(app).get('/api/search?q=crypto').set(editor)).body as SearchResponse;
    expect(none.topics).toHaveLength(0);
  });
  it('locks topics outside a viewer’s access', async () => {
    const body = (await request(app).get('/api/search?q=1099%20tax').set(viewer)).body as SearchResponse;
    expect(body.topics.length).toBeGreaterThan(0);
    expect(body.topics.every((t) => t.locked && t.notes === null)).toBe(true);
    expect(body.notes).toHaveLength(0);
    expect(body.hiddenTopics).toBe(body.topics.length);
  });
});

describe('exports and digests', () => {
  it('exports the scope', async () => {
    const res = await request(app).post('/api/exports?range=7d').set(editor).send({ topicId: 'wires', subId: 'wire-re', includeText: true });
    const body = res.body as ExportResponse;
    expect(res.status).toBe(201);
    const detail = (await request(app).get('/api/topics/wires?sub=wire-re&range=7d').set(editor)).body as TopicDetailResponse;
    expect(body.rows).toBe(detail.sub?.notes);
  });
  it('subscribes and unsubscribes', async () => {
    const on = (await request(app).post('/api/digests').set(editor).send({ topicId: 'wires', subId: 'wire-re', frequency: 'weekly' })).body as DigestStatus;
    expect(on.subscribed).toBe(true);
    const detail = (await request(app).get('/api/topics/wires?sub=wire-re').set(editor)).body as TopicDetailResponse;
    expect(detail.digest.frequency).toBe('weekly');
    const off = (await request(app).delete('/api/digests?topicId=wires&subId=wire-re').set(editor)).body as DigestStatus;
    expect(off.subscribed).toBe(false);
  });
});
