import { Router } from 'express';
import * as Queue from '../models/Queue.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

function emit(app, type, data) {
  const io = app.get('io');
  if (!io) return;
  io.emit('staff:update', { type: type || 'update', ...data });
  io.emit('staff:activity', { at: new Date().toISOString(), ...data });
}

// POST /assignments/recommend — transparent recommendation for a token
router.post('/recommend', requireAuth, requireRole('officer', 'admin', 'reception'), (req, res) => {
  const { tokenId, preferDoctorId } = req.body || {};
  if (!tokenId) return res.status(400).json({ error: 'tokenId is required' });
  const rec = Queue.recommend(tokenId, { preferDoctorId });
  if (!rec.ok) return res.status(409).json({ error: rec.error });
  res.json({ recommendation: rec.recommended, reason: rec.reason, alternatives: rec.alternatives, token: rec.token });
});

// POST /assignments — assign (or change) doctor for a token
router.post('/', requireAuth, requireRole('officer', 'admin', 'reception'), (req, res) => {
  const { tokenId, doctorId, reason, override, preferred } = req.body || {};
  if (!tokenId || !doctorId) return res.status(400).json({ error: 'tokenId and doctorId are required' });
  const result = Queue.assign({ tokenId, doctorId, actorId: req.user.id, actorName: req.user.name, reason, override, preferred });
  if (!result.ok) return res.status(409).json({ error: result.error });
  const token = result.token;
  emit(req.app, 'assignment', { tokenId, doctorId, assigned: result.unchanged ? false : true, tokenNumber: token?.token_number });
  res.json({ token, recommended: false, director: result });
});

export default router;