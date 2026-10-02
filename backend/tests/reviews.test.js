import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import request from 'supertest';

// Isolated test DB (distinct from api.test.js).
const TEST_DB = path.resolve('data', 'test-reviews.db');
process.env.DB_PATH = TEST_DB;
for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

const { createApp } = await import('../app.js');
const app = createApp();

let adminToken;
let deptId;

before(async () => {
  const { run } = await import('../config/db.js');
  const bcrypt = (await import('bcryptjs')).default;
  run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', 'Admin', 'admin@test.in', bcrypt.hashSync('x', 10), 'admin');
  const login = await request(app).post('/auth/login').send({ email: 'admin@test.in', password: 'x' });
  adminToken = login.body.token;
  const dept = await request(app)
    .post('/departments').set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Cardiology', code: 'CARD', color: '#dc2626' });
  deptId = dept.body.department.id;
});

after(async () => {
  const { db } = await import('../config/db.js');
  try { db.close(); } catch {}
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) {
    if (fs.existsSync(f)) fs.rmSync(f);
  }
});

test('public reviews list is empty initially', async () => {
  const res = await request(app).get('/reviews');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.reviews, []);
});

test('submit a patient review -> PENDING', async () => {
  const res = await request(app).post('/reviews').send({
    reviewerName: 'Anita', reviewerType: 'PATIENT', rating: 5,
    comment: 'Great experience', departmentId: deptId,
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.review.status, 'PENDING');
  assert.equal(res.body.review.rating, 5);
});

test('rejects invalid rating', async () => {
  const res = await request(app).post('/reviews').send({ reviewerName: 'A', reviewertype: 'PATIENT', rating: 9, comment: 'x' });
  assert.equal(res.status, 400);
});

test('stores saved review metadata and request details', async () => {
  const res = await request(app).post('/reviews').send({
    reviewerName: 'Nina',
    reviewerType: 'PATIENT',
    rating: 5,
    comment: 'Very smooth queue',
    departmentId: deptId,
    category: 'QUEUE_TRACKING',
    request: 'Add a near-turn notification',
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.review.category, 'QUEUE_TRACKING');
  assert.equal(res.body.review.request, 'Add a near-turn notification');
  assert.equal(res.body.review.status, 'PENDING');
});

test('summary reflects approved count only', async () => {
  const res = await request(app).get('/reviews/summary');
  assert.equal(res.body.summary.count, 0);
});

test('staff submission and moderation flow', async () => {
  const staff = await request(app).post('/reviews').send({ reviewerName: 'Dr. X', reviewerType: 'STAFF', rating: 4, comment: 'Easy to manage queues' });
  const id = staff.body.review.id;
  assert.equal(staff.body.review.reviewer_type, 'STAFF');

  // Not yet approved -> still not public.
  const beforeApprove = await request(app).get('/reviews');
  assert.equal(beforeApprove.body.reviews.length, 0);

  // Admin approve.
  const patch = await request(app)
    .patch(`/reviews/${id}/status`).set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'APPROVED' });
  assert.equal(patch.body.review.status, 'APPROVED');

  const pub = await request(app).get('/reviews');
  assert.equal(pub.body.reviews.length, 1);
  assert.equal(pub.body.reviews[0].reviewer_name, 'Dr. X');

  const sum = await request(app).get('/reviews/summary');
  assert.equal(sum.body.summary.count, 1);
  assert.equal(sum.body.summary.average, 4);
});

test('admin moderation list supports filters', async () => {
  const res = await request(app)
    .get('/reviews/admin?type=STAFF&status=APPROVED').set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.reviews.every((r) => r.reviewer_type === 'STAFF' && r.status === 'APPROVED'));
});

test('moderation requires auth', async () => {
  const res = await request(app).get('/reviews/admin');
  assert.equal(res.status, 401);
});

test('admin can delete a review', async () => {
  const created = await request(app).post('/reviews').send({ reviewerName: 'Tmp', reviewerType: 'PATIENT', rating: 3, comment: 'temp' });
  const id = created.body.review.id;
  const del = await request(app).delete(`/reviews/${id}`).set('Authorization', `Bearer ${adminToken}`);
  assert.equal(del.status, 200);
  const after = await request(app).get(`/reviews/admin?status=PENDING`).set('Authorization', `Bearer ${adminToken}`);
  assert.ok(!after.body.reviews.some((r) => r.id === id));
});