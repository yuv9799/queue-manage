import { Router } from 'express';
import { findByEmail, findById, list, create, verifyPassword } from '../models/User.js';
import { requireAuth, requireRole, signToken } from '../middleware/auth.js';

const router = Router();

// POST /auth/register  (admin only)
router.post('/register', requireAuth, requireRole('admin'), (req, res) => {
  const { name, email, password, role = 'officer' } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (!['admin', 'officer', 'reception', 'doctor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (findByEmail(email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const user = create({ name, email, password, role });
  res.status(201).json({ user });
});

// POST /auth/login  (public)
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
  const user = findByEmail(email);
  if (!user || !verifyPassword(user, password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const { password_hash, ...safe } = user;
  res.json({ token: signToken(safe), user: safe });
});

// GET /auth/me  (authenticated)
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: findById(req.user.id) });
});

// GET /auth/users  (admin only)
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ users: list() });
});

export default router;