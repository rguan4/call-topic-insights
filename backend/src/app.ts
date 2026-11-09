import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { authenticate, resetLoginFailures } from './auth';
import { resetState } from './data/state';
import { HttpError } from './errors';
import { coreRouter, publicRouter } from './routes/core';
import { emergingRouter } from './routes/emerging';
import { insightsRouter } from './routes/insights';
import { labelsRouter } from './routes/labels';
import { notesRouter } from './routes/notes';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  if (process.env.NODE_ENV !== 'production') {
    // Used by end-to-end tests to start from a clean state.
    app.post('/api/dev/reset', (_req, res) => {
      resetState();
      resetLoginFailures();
      res.json({ ok: true });
    });
  }
  app.use('/api', publicRouter);
  app.use('/api', authenticate, coreRouter, notesRouter, insightsRouter, emergingRouter, labelsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    console.error(err);
    res.status(500).json({ error: { code: 'internal', message: 'Something went wrong.' } });
  });
  return app;
}
