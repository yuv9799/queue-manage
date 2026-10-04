import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { migrate } from './config/db.js';
import { corsOptions } from './config/cors.js';

import auth from './routes/auth.js';
import departments from './routes/departments.js';
import areas from './routes/areas.js';
import counters from './routes/counters.js';
import tokens from './routes/tokens.js';
import stats from './routes/stats.js';
import reviews from './routes/reviews.js';
import emergency from './routes/emergency.js';
import otp from './routes/otp.js';
import doctors from './routes/doctors.js';
import patients from './routes/patients.js';
import queues from './routes/queues.js';
import assignments from './routes/assignments.js';
import notifications from './routes/notifications.js';
import audit from './routes/audit.js';
import staff from './routes/staff.js';

migrate();

export function createApp() {
  const app = express();
  app.set('io', null);
  // Behind an HTTPS reverse proxy (Render, NGINX, Cloudflare, etc.) set
  // TRUST_PROXY=1 so req.protocol / req.ip reflect the real client.
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);

  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('dev'));

  app.get('/health', (req, res) => res.json({ ok: true, service: 'kims-queue', ts: new Date().toISOString() }));
  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'kims-queue', ts: new Date().toISOString() }));

  // Root routes
  app.use('/auth', auth);
  app.use('/departments', departments);
  app.use('/areas', areas);
  app.use('/counters', counters);
  app.use('/tokens', tokens);
  app.use('/stats', stats);
  app.use('/reviews', reviews);
  app.use('/emergency', emergency);
  app.use('/auth', otp);
  app.use('/doctors', doctors);
  app.use('/patients', patients);
  app.use('/queues', queues);
  app.use('/assignments', assignments);
  app.use('/notifications', notifications);
  app.use('/audit', audit);
  app.use('/staff', staff);

  // Prefix /api routes for compatibility
  app.use('/api/auth', auth);
  app.use('/api/departments', departments);
  app.use('/api/areas', areas);
  app.use('/api/counters', counters);
  app.use('/api/tokens', tokens);
  app.use('/api/stats', stats);
  app.use('/api/reviews', reviews);
  app.use('/api/emergency', emergency);
  app.use('/api/auth', otp);
  app.use('/api/doctors', doctors);
  app.use('/api/patients', patients);
  app.use('/api/queues', queues);
  app.use('/api/assignments', assignments);
  app.use('/api/notifications', notifications);
  app.use('/api/audit', audit);
  app.use('/api/staff', staff);

  // 404 handler
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // Error handler
  app.use((err, req, res, next) => {
    const status = (typeof err.status === 'number' && err.status >= 400 && err.status < 600)
      ? err.status
      : (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600)
      ? err.statusCode
      : 500;
    if (status === 500) {
      console.error('ERROR', err);
    }
    const message = (status === 400 && err.type === 'entity.parse.failed')
      ? 'Invalid JSON payload'
      : (status === 500 ? 'Internal server error' : err.message);
    res.status(status).json({ error: message, detail: err.message });
  });

  return app;
}

export default createApp;