import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { NoteDetail } from '@cti/shared';
import { createApp } from '../src/app';
import { issueToken } from '../src/auth';
import { notesOf } from '../src/data/notes';
import { SUB } from '../src/data/catalog';

const app = createApp();
const editor = { Authorization: `Bearer ${issueToken('alex').token}` };
const viewer = { Authorization: `Bearer ${issueToken('jordan').token}` };

describe('note drawer API', () => {
  it('returns the same record every time', async () => {
    const first = notesOf(SUB['wire-re'])[0];
    const res = await request(app).get(`/api/notes/${first.id}`).set(editor);
    const body = res.body as NoteDetail;
    expect(body.id).toBe(first.id);
    expect(body.topicPath).toBe('Wires and funding methods › Wire transfers & real estate');
    expect(body.dateTime).toBe(`${first.date}, ${first.time}`);
  });
  it('blocks viewers from other teams', async () => {
    const tax = notesOf(SUB['tax-1099'])[0];
    expect((await request(app).get(`/api/notes/${tax.id}`).set(viewer)).status).toBe(403);
  });
  it('reports a note once', async () => {
    const n = notesOf(SUB['wire-status'])[2];
    const ok = await request(app).post(`/api/notes/${n.id}/reports`).set(editor).send({ reason: 'Wrong topic' });
    expect(ok.status).toBe(201);
    expect((ok.body as NoteDetail).status).toBe('Reported');
    const again = await request(app).post(`/api/notes/${n.id}/reports`).set(editor).send({ reason: 'Wrong topic' });
    expect(again.status).toBe(409);
  });
  it('404s unknown notes', async () => {
    expect((await request(app).get('/api/notes/SN-1').set(editor)).status).toBe(404);
  });
});
