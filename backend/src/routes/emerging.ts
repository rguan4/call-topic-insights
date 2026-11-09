import { Router } from 'express';
import type { CandidateDecisionRequest, User } from '@cti/shared';
import { requireEditor } from '../auth';
import { candidateDetail, decide, emergingOverview, listTasks, parseRange, resumeTasks, retryTask, runDiscovery } from '../services/emerging';

/**
 * Owner: emerging topics service. Emerging topics are company-wide: every signed-in
 * user can read them; only editors can run discovery, retry tasks and decide on candidates.
 */
export const emergingRouter = Router();

resumeTasks();

emergingRouter.get('/emerging', (req, res) => {
  res.json(emergingOverview(parseRange(req.query.range)));
});

emergingRouter.get('/tasks', (_req, res) => {
  res.json(listTasks());
});

emergingRouter.get('/candidates/:id', (req, res) => {
  res.json(candidateDetail(req.params.id));
});

emergingRouter.post('/candidates/:id/decision', requireEditor, (req, res) => {
  res.json(decide(req.params.id, req.body as CandidateDecisionRequest, res.locals.user as User));
});

emergingRouter.post('/tasks/:id/retry', requireEditor, (req, res) => {
  res.status(202).json(retryTask(req.params.id));
});

emergingRouter.post('/discovery/run', requireEditor, (_req, res) => {
  res.status(202).json(runDiscovery());
});
