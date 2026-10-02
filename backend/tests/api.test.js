import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import request from 'supertest';

// Use an isolated test database.
const TEST_DB = path.resolve('data', 'test-queue.db');
process.env.DB_PATH = TEST_DB;
for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

const { createApp } = await import('../app.js');
const app = createApp();

let adminToken;
let deptId;
let areaId;
let counterId;

before(async () => {
  // Register admin (first user: no admin exists yet, so seed an admin directly).
  const { db, run } = await import('../config/db.js');
  const bcrypt = (await import('bcryptjs')).default;
  run(
    'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
    'Test Admin',
    'admin@test.in',
    bcrypt.hashSync('admin123', 10),
    'admin'
  );
  const login = await request(app).post('/auth/login').send({ email: 'admin@test.in', password: 'admin123' });
  adminToken = login.body.token;

  const dept = await request(app)
    .post('/departments').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Pharmacy', code: 'PHARM', color: '#16a34a' });
  deptId = dept.body.department.id;

  const area = await request(app)
    .post('/areas').set('Authorization', `Bearer ${adminToken}`)
    .send({ departmentId: deptId, name: '1st Floor Pharmacy', code: 'PHARM-1F', floor: '1st Floor' });
  areaId = area.body.area.id;

  const counter = await request(app)
    .post('/counters').set('Authorization', `Bearer ${adminToken}`)
    .send({ areaId, name: 'Window 1' });
  counterId = counter.body.counter.id;
});

after(async () => {
  const { db } = await import('../config/db.js');
  try { db.close(); } catch {}
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
});

test('health check responds', async () => {
  const res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('login rejects bad credentials', async () => {
  const res = await request(app).post('/auth/login').send({ email: 'admin@test.in', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('protected route requires auth', async () => {
  const res = await request(app).get('/stats/overview');
  assert.equal(res.status, 401);
});

test('issue a token returns token + position', async () => {
  const res = await request(app).post('/tokens').send({ departmentId: deptId, areaId, patientName: 'Anita' });
  assert.equal(res.status, 201);
  assert.equal(res.body.token.status, 'queued');
  assert.equal(res.body.token.queue_seq, 1);
  assert.equal(res.body.token.token_number, 1);
  assert.equal(res.body.position, 1);
});

test('second token gets next queue_seq and position', async () => {
  await request(app).post('/tokens').send({ departmentId: deptId, areaId });
  const res = await request(app).post('/tokens').send({ departmentId: deptId, areaId });
  assert.equal(res.body.token.queue_seq, 3);
  assert.equal(res.body.position, 3);
});

test('call then complete a token', async () => {
  const issue = await request(app).post('/tokens').send({ departmentId: deptId, areaId });
  const id = issue.body.token.id;

  const called = await request(app)
    .post(`/tokens/${id}/call`).set('Authorization', `Bearer ${adminToken}`)
    .send({ counterId });
  assert.equal(called.status, 200);
  assert.equal(called.body.token.status, 'called');
  assert.equal(called.body.token.serving, true);

  const completed = await request(app)
    .post(`/tokens/${id}/complete`).set('Authorization', `Bearer ${adminToken}`);
  assert.equal(completed.body.token.status, 'completed');
  assert.ok(completed.body.token.wait_time !== null);
});

test('invalid transition is rejected (complete without call)', async () => {
  const issue = await request(app).post('/tokens').send({ departmentId: deptId, areaId });
  const id = issue.body.token.id;
  const res = await request(app)
    .post(`/tokens/${id}/complete`).set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 409);
});

test('next calls the first queued token', async () => {
  // Fresh isolated area to avoid cross-test ordering effects.
  const dept = await request(app)
    .post('/departments').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Lab', code: `LAB-${Date.now()}`, color: '#9333ea' });
  const deptId2 = dept.body.department.id;
  const area = await request(app)
    .post('/areas').set('Authorization', `Bearer ${adminToken}`)
    .send({ departmentId: deptId2, name: 'Lab Queue', code: `LABQ-${Date.now()}` });
  const areaId2 = area.body.area.id;
  const counter = await request(app)
    .post('/counters').set('Authorization', `Bearer ${adminToken}`)
    .send({ areaId: areaId2, name: 'Desk 1' });
  const counterId2 = counter.body.counter.id;

  const a = await request(app).post('/tokens').send({ departmentId: deptId2, areaId: areaId2 });
  const b = await request(app).post('/tokens').send({ departmentId: deptId2, areaId: areaId2 });
  const res = await request(app)
    .post('/tokens/next').set('Authorization', `Bearer ${adminToken}`)
    .send({ areaId: areaId2, counterId: counterId2 });
  assert.equal(res.status, 200);
  assert.equal(res.body.token.id, a.body.token.id);
  assert.equal(res.body.token.status, 'called');
  assert.ok(b.body.token.id !== res.body.token.id);
});

test('live snapshot groups by area', async () => {
  const res = await request(app).get('/tokens/live');
  assert.equal(res.status, 200);
  const area = res.body.areas.find((x) => x.area.id === areaId);
  assert.ok(area, 'area present in live snapshot');
  assert.ok(Array.isArray(area.serving));
  assert.ok(Array.isArray(area.queue));
});

test('hold then re-call a token', async () => {
  const issue = await request(app).post('/tokens').send({ departmentId: deptId, areaId });
  const id = issue.body.token.id;
  await request(app).post(`/tokens/${id}/call`).set('Authorization', `Bearer ${adminToken}`).send({ counterId });
  const held = await request(app).post(`/tokens/${id}/hold`).set('Authorization', `Bearer ${adminToken}`);
  assert.equal(held.body.token.status, 'held');
  const recalled = await request(app).post(`/tokens/${id}/call`).set('Authorization', `Bearer ${adminToken}`).send({ counterId });
  assert.equal(recalled.body.token.status, 'called');
});

test('stats overview returns numbers', async () => {
  const res = await request(app).get('/stats/overview').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.equal(typeof res.body.overview.queuedNow, 'number');
  assert.equal(typeof res.body.overview.completedToday, 'number');
});