import { Router } from 'express';
import type { DraftChangeRequest, PublishRequest, User } from '@cti/shared';
import { requireEditor } from '../auth';
import {
  activate, compareTopics, createDraftChange, deleteDraftChange, draftsFor, publish, retryPreparation, taxonomyTree,
  topicDetail, updateDraftReason, versions
} from '../services/labels';

/** Owner: label management service. */
export const labelsRouter = Router();

const user = (res: { locals: Record<string, unknown> }) => res.locals.user as User;

// Taxonomy (read: everyone; notes counts cover all teams, note text respects access).
labelsRouter.get('/taxonomy/tree', (req, res) => {
  res.json(taxonomyTree(req.query.range, req.query.q));
});
labelsRouter.get('/taxonomy/topics/:id', (req, res) => {
  res.json(topicDetail(req.params.id, req.query.range, user(res)));
});
labelsRouter.get('/taxonomy/compare', (req, res) => {
  res.json(compareTopics(req.query.a, req.query.b, req.query.range, user(res)));
});

// Draft changes.
labelsRouter.get('/drafts', (_req, res) => {
  res.json(draftsFor(user(res)));
});
labelsRouter.post('/drafts', requireEditor, (req, res) => {
  res.status(201).json(createDraftChange(req.body as DraftChangeRequest, user(res)));
});
labelsRouter.patch('/drafts/:id', requireEditor, (req, res) => {
  res.json(updateDraftReason(req.params.id, (req.body as { reason?: string }).reason, user(res)));
});
labelsRouter.delete('/drafts/:id', requireEditor, (req, res) => {
  deleteDraftChange(req.params.id, user(res));
  res.status(204).end();
});

// Versions.
labelsRouter.get('/versions', (_req, res) => {
  res.json(versions());
});
labelsRouter.post('/versions/publish', requireEditor, (req, res) => {
  res.status(201).json(publish((req.body as PublishRequest | undefined)?.historical, user(res)));
});
labelsRouter.post('/versions/:id/retry-preparation', requireEditor, (req, res) => {
  res.json(retryPreparation(req.params.id));
});
labelsRouter.post('/versions/:id/activate', requireEditor, (req, res) => {
  res.json(activate(req.params.id));
});
