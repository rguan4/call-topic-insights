import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { OverviewResponse } from '@cti/shared';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';

const app = createApp();
const editor = { Authorization: `Bearer ${issueToken('alex').token}` };
const viewer = { Authorization: `Bearer ${issueToken('jordan').token}` };

describe('auth', () => {
  it('rejects requests without a user', async () => {
    const res = await request(app).get('/api/overview');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/overview', () => {
  it('matches the prototype totals for the last 30 days', async () => {
    const res = await request(app).get('/api/overview').set(editor);
    const body = res.body as OverviewResponse;
    expect(res.status).toBe(200);
    expect(body.inScope.notes).toBe(18420);
    expect(body.inScope.topicCount).toBe(89);
    expect(body.topics[0]).toMatchObject({ id: 'wires', notes: 2940 });
    expect(body.scope.span).toBe('Oct 9 – Nov 7, 2026');
    expect(body.scope.prevSpan).toBe('Sep 9 – Oct 8, 2026');
    expect(body.historical?.team).toBe('tax');
  });

  it('only returns topics owned by the selected team', async () => {
    const res = await request(app).get('/api/overview?team=access').set(editor);
    const body = res.body as OverviewResponse;
    expect(body.topics.map((t) => t.id)).toEqual(['access']);
    expect(body.changes.every((c) => c.parentId === 'access')).toBe(true);
    expect(body.historical).toBeNull();
    expect(body.inScope.notes).toBe(2180);
    // Company-wide figures stay company-wide.
    expect(body.companyWide.totalNotes).toBe(18420);
  });

  it('keeps subtopic sums equal to the topic for every range', async () => {
    for (const range of ['7d', '30d', '90d']) {
      const res = await request(app).get(`/api/overview?range=${range}`).set(editor);
      const body = res.body as OverviewResponse;
      const sumTopics = body.topics.reduce((a, t) => a + t.notes, 0);
      expect(sumTopics).toBeLessThanOrEqual(body.inScope.notes);
      expect(body.topics.every((t) => t.notes > 0)).toBe(true);
    }
  });

  it('restricts viewers to their team', async () => {
    const own = await request(app).get('/api/overview').set(viewer);
    expect(own.status).toBe(200);
    expect((own.body as OverviewResponse).scope.team).toBe('money');
    const other = await request(app).get('/api/overview?team=tax').set(viewer);
    expect(other.status).toBe(403);
    const all = await request(app).get('/api/overview?team=all').set(viewer);
    expect(all.status).toBe(403);
  });

  it('validates filters', async () => {
    expect((await request(app).get('/api/overview?range=1y').set(editor)).status).toBe(400);
    expect((await request(app).get('/api/overview?version=v9').set(editor)).status).toBe(400);
  });
});
