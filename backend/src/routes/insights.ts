import { Router } from 'express';
import type { InsightScopeInput, User } from '@cti/shared';
import { createInsight, getInsight, latestInsight, previewScope, reportInsight, setHelpful } from '../services/insights';

/** Owner: AI insights service. */
export const insightsRouter = Router();

/** Start a job. Poll GET /insights/:id until status isn't 'running'. */
insightsRouter.post('/insights', (req, res) => {
  res.status(202).json(createInsight(req.body as InsightScopeInput, res.locals.user as User));
});

/** What a new insight would cover (topic label, dates, note counts). Creates nothing. */
insightsRouter.get('/insights/scope', (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  res.json(previewScope({
    topicId: q.topicId ?? '', subId: q.subId ?? 'all',
    range: (q.range ?? '30d') as InsightScopeInput['range'], version: q.version ?? '', team: (q.team ?? '') as InsightScopeInput['team']
  } as InsightScopeInput, res.locals.user as User));
});

/** Most recent insight the user generated for a topic + subtopic (any range/version). */
insightsRouter.get('/insights/latest', (req, res) => {
  res.json(latestInsight(String(req.query.topicId ?? ''), String(req.query.subId ?? 'all'), res.locals.user as User));
});

insightsRouter.get('/insights/:id', (req, res) => {
  res.json(getInsight(req.params.id, res.locals.user as User));
});

insightsRouter.post('/insights/:id/feedback', (req, res) => {
  res.json(setHelpful(req.params.id, (req.body as { helpful?: unknown }).helpful, res.locals.user as User));
});

insightsRouter.post('/insights/:id/reports', (req, res) => {
  const body = req.body as { reason?: unknown; details?: unknown };
  res.status(201).json(reportInsight(req.params.id, body.reason, body.details, res.locals.user as User));
});
