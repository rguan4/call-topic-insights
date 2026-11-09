import { Router } from 'express';
import type { DigestRequest, ExportRequest, ExportResponse, ReportRequest, TopicSort, User } from '@cti/shared';
import { RANGES } from '../data/dates';
import { SUB } from '../data/catalog';
import { notesOf } from '../data/notes';
import { save, state } from '../data/state';
import { HttpError } from '../errors';
import { parseFilters } from '../filters';
import { listNotes, noteDetail, type NotesParams } from '../services/notes';
import { search } from '../services/search';
import { digestKey, digestStatus, listTopics, resolveTopic, topicDetail } from '../services/topics';

/**
 * Notes & topics service.
 *  GET    /topics?q=&sort=notes|change|name            + range, version, team
 *  GET    /topics/:topicId?sub=<subId|all>             + filters
 *  GET    /notes?topic=&sub=&date=&status=&q=&sort=&page=&per=&insight=&issue=  + filters
 *  GET    /notes/:id?version=                          (shared note drawer)
 *  POST   /notes/:id/reports                           (shared note drawer)
 *  GET    /search?q=                                   + filters
 *  POST   /exports   { topicId, subId, includeText }   + filters
 *  POST   /digests   { topicId, subId, frequency }
 *  DELETE /digests?topicId=&subId=
 */
export const notesRouter = Router();

const user = (res: { locals: Record<string, unknown> }) => res.locals.user as User;
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

notesRouter.get('/topics', (req, res) => {
  const f = parseFilters(req.query, user(res));
  const sort = (str(req.query.sort) ?? 'notes') as TopicSort;
  if (!['notes', 'change', 'name'].includes(sort)) throw new HttpError(400, 'invalid_sort', 'Unknown sort.');
  res.json(listTopics(f, str(req.query.q) ?? '', sort));
});

notesRouter.get('/topics/:topicId', (req, res) => {
  const f = parseFilters(req.query, user(res));
  res.json(topicDetail(f, user(res), req.params.topicId, str(req.query.sub)));
});

notesRouter.get('/notes', (req, res) => {
  const f = parseFilters(req.query, user(res));
  const params: NotesParams = {};
  for (const k of ['topic', 'sub', 'date', 'status', 'q', 'sort', 'page', 'per', 'insight', 'issue'] as const) params[k] = str(req.query[k]);
  res.json(listNotes(f, user(res), params));
});

notesRouter.get('/notes/:id', (req, res) => {
  const version = String(req.query.version ?? state.activeVersion);
  res.json(noteDetail(req.params.id, version, user(res)));
});

const REASONS = ['Wrong topic', 'Should be no suitable topic', 'Note covers several issues', 'Other'];

notesRouter.post('/notes/:id/reports', (req, res) => {
  const u = user(res);
  const body = req.body as ReportRequest;
  const version = String(req.query.version ?? state.activeVersion);
  const current = noteDetail(req.params.id, version, u);
  if (!current.canReport) throw new HttpError(409, 'already_reported', 'This note has already been reported.');
  if (!REASONS.includes(body.reason)) throw new HttpError(400, 'invalid_reason', 'Choose a reason.');
  if (body.suggestedSubId && !SUB[body.suggestedSubId]) throw new HttpError(400, 'invalid_topic', 'Unknown topic.');
  state.reports[current.id] = {
    reason: body.reason,
    suggestedSubId: body.suggestedSubId ?? null,
    comment: String(body.comment ?? '').slice(0, 2000),
    ref: `RPT-${4100 + Object.keys(state.reports).length + 1}`,
    by: u.id,
    at: new Date().toISOString()
  };
  save();
  res.status(201).json(noteDetail(req.params.id, version, u));
});

notesRouter.get('/search', (req, res) => {
  const f = parseFilters(req.query, user(res));
  const q = (str(req.query.q) ?? '').trim();
  if (!q) throw new HttpError(400, 'empty_query', 'Enter something to search for.');
  res.json(search(f, user(res), q.slice(0, 200)));
});

notesRouter.post('/exports', (req, res) => {
  const f = parseFilters(req.query, user(res));
  const body = req.body as ExportRequest;
  const { p, s } = resolveTopic(String(body.topicId), body.subId, user(res));
  const days = RANGES[f.range].days;
  const rows = (s ? [s] : p.subs).reduce((a, x) => a + notesOf(x).filter((n) => n.off < days).length, 0);
  const out: ExportResponse = {
    fileName: `support-notes-${s ? s.id : p.id}-${f.range}${body.includeText ? '' : '-no-text'}.csv`,
    rows,
    expiresAt: 'Nov 16, 2026'
  };
  res.status(201).json(out);
});

notesRouter.post('/digests', (req, res) => {
  const u = user(res);
  const body = req.body as DigestRequest;
  const { p, s } = resolveTopic(String(body.topicId), body.subId, u);
  if (body.frequency !== 'weekly' && body.frequency !== 'daily') throw new HttpError(400, 'invalid_frequency', 'Choose weekly or daily.');
  const subId = s ? s.id : 'all';
  state.digests[digestKey(u, p.id, subId)] = { frequency: body.frequency, since: new Date().toISOString() };
  save();
  res.status(201).json(digestStatus(u, p.id, subId));
});

notesRouter.delete('/digests', (req, res) => {
  const u = user(res);
  const { p, s } = resolveTopic(String(req.query.topicId), str(req.query.subId), u);
  const subId = s ? s.id : 'all';
  delete state.digests[digestKey(u, p.id, subId)];
  save();
  res.json(digestStatus(u, p.id, subId));
});
