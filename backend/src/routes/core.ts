import { Router } from 'express';
import type { LoginResponse, MetaResponse, User } from '@cti/shared';
import { login } from '../auth';
import { RANGES, SYNCED_AT } from '../data/dates';
import { TEAMS, TOPICS, subName } from '../data/catalog';
import { state } from '../data/state';
import { parseFilters, selectableVersions } from '../filters';
import { buildOverview } from '../services/overview';
import { candidatesNeedingReview } from '../services/emerging';
import { draftChangeCount } from '../services/labels';

export const publicRouter = Router();

/** Email + password sign-in. Returns a signed session token for the Authorization header. */
publicRouter.post('/auth/login', (req, res) => {
  const result = login(req.body?.email, req.body?.password);
  if (!result.ok) {
    res.status(result.status).json({ error: { code: result.code, message: result.message } });
    return;
  }
  const body: LoginResponse = { token: result.token, expiresAt: result.expiresAt, user: result.user };
  res.json(body);
});

export const coreRouter = Router();

coreRouter.get('/me', (_req, res) => {
  res.json(res.locals.user as User);
});

coreRouter.get('/meta', (_req, res) => {
  const body: MetaResponse = {
    activeVersion: state.activeVersion,
    selectableVersions: selectableVersions(),
    subtopics: TOPICS.flatMap((p) => p.subs.map((s) => ({ id: s.id, name: subName(s, state.activeVersion), parentId: p.id, parentName: p.name, team: p.team }))),
    badges: { candidatesNeedingReview: candidatesNeedingReview(), draftChanges: draftChangeCount() },
    teams: (Object.keys(TEAMS) as (keyof typeof TEAMS)[]).map((id) => ({ id, label: TEAMS[id] })),
    ranges: (Object.keys(RANGES) as (keyof typeof RANGES)[]).map((id) => ({ id, label: RANGES[id].label })),
    syncedAt: SYNCED_AT
  };
  res.json(body);
});

coreRouter.get('/overview', (req, res) => {
  const f = parseFilters(req.query, res.locals.user as User);
  res.json(buildOverview(f));
});
