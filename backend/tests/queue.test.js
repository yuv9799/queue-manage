import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import request from 'supertest';

// Isolated test database.
const TEST_DB = path.resolve('data', 'test-queue2.db');
process.env.DB_PATH = TEST_DB;
for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);

const { createApp } = await import('../app.js');
const app = createApp();

let adminToken;
let deptId;
let areaId;
let docA;
let docB;

before(async () => {
  const { run } = await import('../config/db.js');
  const bcrypt = (await import('bcryptjs')).default;
  run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', 'Admin', 'admin@qq.in', bcrypt.hashSync('admin123', 10), 'admin');
  const login = await request(app).post('/auth/login').send({ email: 'admin@qq.in', password: 'admin123' });
  adminToken = login.body.token;
  const H = ['Authorization', `Bearer ${adminToken}`];

  const dept = await request(app).post('/departments').set(H[0], H[1]).send({ name: 'Cardio', code: `QQC-${Date.now()}` });
  deptId = dept.body.department.id;
  const area = await request(app).post('/areas').set(H[0], H[1]).send({ departmentId: deptId, name: 'OPD', code: `QQA-${Date.now()}` });
  areaId = area.body.area.id;

  const mkDoctor = async (name, status) => {
    const d = await request(app).post('/doctors').set(H[0], H[1]).send({ name, departmentId: deptId, status });
    return d.body.doctor;
  };
  docA = await mkDoctor('Dr A Available', 'available');
  docB = await mkDoctor('Dr B Break', 'break');
});

after(async () => {
  const { db } = await import('../config/db.js');
  try { db.close(); } catch {}
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
});

const auth = () => ['Authorization', `Bearer ${adminToken}`];
async function issue() {
  const r = await request(app).post('/tokens').send({ departmentId: deptId, areaId, patientName: 'P' + Date.now() });
  return r.body.token;
}

test('recommendation picks an available doctor, not break/offline', async () => {
  const t = await issue();
  const rec = await request(app).post('/assignments/recommend').set(...auth()).send({ tokenId: t.id });
  assert.equal(rec.status, 200);
  assert.equal(rec.body.recommendation.id, docA.id);
});

test('assign to an available doctor works', async () => {
  const t = await issue();
  const r = await request(app).post('/assignments').set(...auth()).send({ tokenId: t.id, doctorId: docA.id, reason: 'test' });
  assert.equal(r.status, 200);
  assert.equal(r.body.token.doctor_id, docA.id);
});

test('assigning to an unavailable (break) doctor is rejected without override', async () => {
  const t = await issue();
  const r = await request(app).post('/assignments').set(...auth()).send({ tokenId: t.id, doctorId: docB.id });
  assert.equal(r.status, 409);
});

test('duplicate assignment to the same doctor is an idempotent safe no-op', async () => {
  const t = await issue();
  await request(app).post('/assignments').set(...auth()).send({ tokenId: t.id, doctorId: docA.id, reason: 'x' });
  const dup = await request(app).post('/assignments').set(...auth()).send({ tokenId: t.id, doctorId: docA.id });
  assert.equal(dup.status, 200);
  assert.equal(dup.body.director.unchanged, true);
});

test('priority change requires a reason', async () => {
  const t = await issue();
  const noReason = await request(app).post(`/tokens/${t.id}/priority`).set(...auth()).send({ priority: 'URGENT', reason: '' });
  assert.equal(noReason.status, 409);
  const ok = await request(app).post(`/tokens/${t.id}/priority`).set(...auth()).send({ priority: 'URGENT', reason: 'clinical instruction' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.token.priority, 'URGENT');
});

test('state machine: no-show only from called', async () => {
  const t = await issue();
  const noFromQueued = await request(app).post(`/tokens/${t.id}/no-show`).set(...auth());
  assert.equal(noFromQueued.status, 409);
  await request(app).post(`/tokens/${t.id}/call`).set(...auth());
  const noShow = await request(app).post(`/tokens/${t.id}/no-show`).set(...auth());
  assert.equal(noShow.status, 200);
  assert.equal(noShow.body.token.status, 'no_show');
});

test('completion records wait_time', async () => {
  const t = await issue();
  await request(app).post(`/tokens/${t.id}/call`).set(...auth());
  const done = await request(app).post(`/tokens/${t.id}/complete`).set(...auth());
  assert.equal(done.status, 200);
  assert.equal(done.body.token.status, 'completed');
  assert.ok(done.body.token.wait_time !== null);
});

test('audit log records staff actions', async () => {
  const t = await issue();
  await request(app).post('/assignments').set(...auth()).send({ tokenId: t.id, doctorId: docA.id, reason: 'audit test' });
  const logs = await request(app).get('/audit?limit=5').set(...auth());
  assert.equal(logs.status, 200);
  assert.ok(logs.body.logs.length >= 1);
});

test('unauthorized role cannot list doctors', async () => {
  const r = await request(app).get('/doctors');
  assert.equal(r.status, 401);
});