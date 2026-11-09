import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { issueToken, resetLoginFailures, verifyToken } from '../src/auth';

const app = createApp();

describe('POST /api/auth/login', () => {
  beforeEach(() => resetLoginFailures());

  it('signs in the editor test account and the token works', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'alex.chen@example.com', password: 'Editor#2026' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'alex', role: 'editor' });
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.body.name).toBe('Alex Chen');
  });

  it('signs in the viewer test account (email is case-insensitive)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: ' Jordan.Lee@example.com ', password: 'Viewer#2026' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'jordan', role: 'viewer' });
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    const a = await request(app).post('/api/auth/login').send({ email: 'alex.chen@example.com', password: 'Viewer#2026' });
    const b = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Editor#2026' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('requires both fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'alex.chen@example.com' });
    expect(res.status).toBe(400);
  });

  it('locks an email for a few minutes after 5 failed attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: 'jordan.lee@example.com', password: 'wrong' });
    }
    const res = await request(app).post('/api/auth/login').send({ email: 'jordan.lee@example.com', password: 'Viewer#2026' });
    expect(res.status).toBe(429);
  });
});

describe('session tokens', () => {
  it('rejects tampered, expired and old dev-style tokens', async () => {
    const { token } = issueToken('jordan');
    expect(verifyToken(token)?.id).toBe('jordan');
    expect(verifyToken(token.replace(/^jordan/, 'alex'))).toBeUndefined();
    expect(verifyToken(issueToken('alex', Date.now() - 13 * 3600_000).token)).toBeUndefined();
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer dev-alex');
    expect(res.status).toBe(401);
  });
});
