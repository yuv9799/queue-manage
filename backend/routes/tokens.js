import { Router } from 'express';
import * as Token from '../models/Token.js';
import * as Department from '../models/Department.js';
import * as Area from '../models/Area.js';
import * as Patient from '../models/Patient.js';
import * as Queue from '../models/Queue.js';
import * as Doctor from '../models/Doctor.js';
import * as Audit from '../models/Audit.js';
import * as Notify from '../models/Notify.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

function broadcast(app, token, extra = {}) {
  const io = app.get('io');
  if (!io) return;
  io.emit('token:updated', { token, ...extra });
  if (extra.action === 'token_created') {
    io.emit('token:created', { token, ...extra });
  } else if (extra.action === 'called') {
    io.emit('token:called', { token, ...extra });
  } else if (extra.action === 'serving' || extra.action === 'in_consultation') {
    io.emit('token:started', { token, ...extra });
  } else if (extra.action === 'completed') {
    io.emit('token:completed', { token, ...extra });
  } else if (extra.action === 'skipped') {
    io.emit('token:skipped', { token, ...extra });
  } else if (extra.action === 'cancelled') {
    io.emit('token:cancelled', { token, ...extra });
  }

  io.emit('queue:updated', {
    areaId: token?.area_id,
    departmentId: token?.department_id,
    doctorId: token?.doctor_id,
  });
  io.emit('staff:update', { type: 'token', token, ...extra });
  io.emit('staff:activity', {
    at: new Date().toISOString(),
    ...extra,
    tokenNumber: token?.token_number,
    tokenCode: token?.token_code,
    doctorId: token?.doctor_id,
    doctorName: token?.doctor_name,
  });
}

// POST /tokens — issue a token (kiosk + staff)
router.post('/', optionalAuth, (req, res) => {
  const b = req.body || {};
  const departmentId = b.departmentId ?? b.department_id;
  const areaId = b.areaId ?? b.area_id;
  const patientName = b.patientName ?? b.patient_name;
  const phone = b.phone ?? b.patient_phone ?? b.phoneNumber;
  const preferredDoctorId = b.preferredDoctorId ?? b.preferred_doctor_id;
  const doctorId = b.doctorId ?? b.doctor_id;
  const priority = b.priority;

  if (!departmentId) {
    return res.status(400).json({ error: 'departmentId is required' });
  }
  const dept = Department.findById(departmentId);
  if (!dept) return res.status(400).json({ error: 'Department not found' });

  // If areaId is not provided, pick the primary service area for this department
  let effectiveAreaId = areaId;
  if (!effectiveAreaId) {
    const areas = Area.list({ departmentId });
    if (areas.length > 0) {
      effectiveAreaId = areas[0].id;
    } else {
      return res.status(400).json({ error: 'No service area found for this department' });
    }
  }

  // Register/lookup patient when identifying info is supplied.
  let patientId = req.body && req.body.patientId;
  if (!patientId && (patientName || phone)) {
    const patient = Patient.findOrCreate({ name: patientName || 'Walk-in', phone });
    patientId = patient.id;
  }

  // Determine assigned doctor:
  // 1. If explicit doctorId was provided
  // 2. Or auto-assign best doctor in that department
  let assignedDoctorId = doctorId ? Number(doctorId) : null;
  if (!assignedDoctorId) {
    const bestDoctor = Queue.findBestDoctorForDepartment(departmentId, {
      preferredDoctorId: preferredDoctorId || null,
    });
    if (bestDoctor) {
      assignedDoctorId = bestDoctor.id;
    }
  }

  // Staff can specify priority
  const staff = req.user;
  const usePriority = staff ? (Token.PRIORITIES.includes(priority) ? priority : 'NORMAL') : 'NORMAL';

  const { token, position } = Token.issue({
    departmentId,
    areaId: effectiveAreaId,
    patientName,
    patientId,
    doctorId: assignedDoctorId,
    preferredDoctorId: preferredDoctorId ? Number(preferredDoctorId) : null,
    priority: usePriority,
  });

  const estimates = Queue.calculateEstimates(token);

  Audit.log({
    actorId: staff?.id || null,
    actorName: staff?.name || 'kiosk',
    action: 'TOKEN_CREATED',
    targetType: 'token',
    targetId: token.id,
    newValue: String(token.token_number),
    reason: token.doctor_name ? `Assigned to ${token.doctor_name}` : null,
  });

  const notifications = Notify.notify({ token, event: 'token_created' });
  broadcast(req.app, token, { action: 'token_created', position, ...estimates });

  res.status(201).json({
    token,
    position: estimates.position,
    peopleAhead: estimates.peopleAhead,
    estimatedWaitMinutes: estimates.estimatedWaitMinutes,
    estimatedServiceTime: estimates.estimatedServiceTime,
    notifications,
  });
});

// GET /tokens/live — TV board (public)
router.get('/live', (req, res) => {
  const areaId = req.query.areaId;
  res.json({ areas: Token.live({ areaId }) });
});

// GET /tokens/by-number/:number — public lookup
router.get('/by-number/:number', (req, res) => {
  const token = Token.findByNumber(req.params.number);
  if (!token) return res.status(404).json({ error: 'Token not found' });
  const estimates = Queue.calculateEstimates(token);
  res.json({ token, ...estimates });
});

// GET /tokens — list/filtered list
router.get('/', optionalAuth, (req, res) => {
  const { status, areaId, departmentId, doctorId, limit } = req.query;
  const tokens = Token.list({
    status,
    areaId: areaId ? Number(areaId) : undefined,
    departmentId: departmentId ? Number(departmentId) : undefined,
    doctorId: doctorId ? Number(doctorId) : undefined,
    limit: limit ? Number(limit) : 500,
  });
  res.json({ tokens });
});

// GET /tokens/:id/status — public status lookup alias
router.get('/:id/status', (req, res) => {
  const token = Token.findById(req.params.id) || Token.findByNumber(req.params.id);
  if (!token) return res.status(404).json({ error: 'Token not found' });
  const estimates = Queue.calculateEstimates(token);
  res.json({ token, ...estimates });
});

// GET /tokens/:id — single token + dynamic queue calculations
router.get('/:id', (req, res) => {
  const token = Token.findById(req.params.id) || Token.findByNumber(req.params.id);
  if (!token) return res.status(404).json({ error: 'Token not found' });
  const estimates = Queue.calculateEstimates(token);
  res.json({ token, ...estimates });
});

function handle(req, res, fn) {
  const result = fn();
  if (!result.ok) return res.status(409).json({ error: result.error });
  const estimates = Queue.calculateEstimates(result.token);
  broadcast(req.app, result.token, { action: result.action, ...estimates });
  res.json({
    token: result.token,
    notifications: result.notifications,
    ...estimates,
  });
}

const officer = requireRole('officer', 'admin', 'reception', 'doctor');

// Call patient
const callHandler = (req, res) =>
  handle(req, res, () => {
    const r = Queue.doCall({
      tokenId: req.params.id,
      counterId: req.body && (req.body.counterId ?? req.body.counter_id),
      actorId: req.user.id,
      actorName: req.user.name,
    });
    r.action = 'called';
    return r;
  });

router.post('/:id/call', requireAuth, officer, callHandler);
router.patch('/:id/call', requireAuth, officer, callHandler);

// Recall patient
const recallHandler = (req, res) =>
  handle(req, res, () => {
    const r = Queue.doRecall({
      tokenId: req.params.id,
      counterId: req.body && (req.body.counterId ?? req.body.counter_id),
      actorId: req.user.id,
      actorName: req.user.name,
    });
    r.action = 'recalled';
    return r;
  });

router.post('/:id/recall', requireAuth, officer, recallHandler);
router.patch('/:id/recall', requireAuth, officer, recallHandler);

// Start / Serve consultation (CALLED -> IN_CONSULTATION / SERVING)
const serveHandler = (req, res) =>
  handle(req, res, () => {
    const r = Queue.doServe({
      tokenId: req.params.id,
      actorId: req.user.id,
      actorName: req.user.name,
    });
    r.action = 'serving';
    return r;
  });

router.post('/:id/serve', requireAuth, officer, serveHandler);
router.patch('/:id/serve', requireAuth, officer, serveHandler);
router.post('/:id/start', requireAuth, officer, serveHandler);
router.patch('/:id/start', requireAuth, officer, serveHandler);

// Complete consultation
const completeHandler = (req, res) =>
  handle(req, res, () => {
    const r = Queue.doComplete({
      tokenId: req.params.id,
      actorId: req.user.id,
      actorName: req.user.name,
    });
    r.action = 'completed';
    return r;
  });

router.post('/:id/complete', requireAuth, officer, completeHandler);
router.patch('/:id/complete', requireAuth, officer, completeHandler);

// Skip token
const skipHandler = (req, res) =>
  handle(req, res, () => {
    const r = Queue.doSkip({
      tokenId: req.params.id,
      actorId: req.user.id,
      actorName: req.user.name,
      reason: req.body && req.body.reason,
    });
    r.action = 'skipped';
    return r;
  });

router.post('/:id/skip', requireAuth, officer, skipHandler);
router.patch('/:id/skip', requireAuth, officer, skipHandler);

// No-show
const noShowHandler = (req, res) =>
  handle(req, res, () => {
    const r = Queue.doNoShow({
      tokenId: req.params.id,
      actorId: req.user.id,
      actorName: req.user.name,
    });
    r.action = 'no_show';
    return r;
  });

router.post('/:id/no-show', requireAuth, officer, noShowHandler);
router.patch('/:id/no-show', requireAuth, officer, noShowHandler);

// Hold token
const holdHandler = (req, res) =>
  handle(req, res, () => {
    const r = Queue.doHold({
      tokenId: req.params.id,
      actorId: req.user.id,
      actorName: req.user.name,
    });
    r.action = 'held';
    return r;
  });

router.post('/:id/hold', requireAuth, officer, holdHandler);
router.patch('/:id/hold', requireAuth, officer, holdHandler);

// Cancel token
const cancelHandler = (req, res) =>
  handle(req, res, () => {
    const r = Queue.doCancel({
      tokenId: req.params.id,
      actorId: req.user.id,
      actorName: req.user.name,
      reason: req.body && req.body.reason,
    });
    r.action = 'cancelled';
    return r;
  });

router.post('/:id/cancel', requireAuth, requireRole('officer', 'admin', 'reception', 'doctor'), cancelHandler);
router.patch('/:id/cancel', requireAuth, requireRole('officer', 'admin', 'reception', 'doctor'), cancelHandler);

// Reassign doctor to token
const assignDoctorHandler = (req, res) => {
  const { doctorId, reason, override } = req.body || {};
  if (!doctorId) return res.status(400).json({ error: 'doctorId is required' });

  const result = Queue.assign({
    tokenId: req.params.id,
    doctorId: Number(doctorId),
    actorId: req.user.id,
    actorName: req.user.name,
    reason: reason || 'Staff reassignment',
    override: !!override,
  });

  if (!result.ok) return res.status(409).json({ error: result.error });

  const estimates = Queue.calculateEstimates(result.token);
  broadcast(req.app, result.token, { action: 'doctor_assigned', ...estimates });
  res.json({ token: result.token, ...estimates });
};

router.post('/:id/assign-doctor', requireAuth, requireRole('officer', 'admin', 'reception'), assignDoctorHandler);
router.patch('/:id/assign-doctor', requireAuth, requireRole('officer', 'admin', 'reception'), assignDoctorHandler);

// Priority
router.post('/:id/priority', requireAuth, requireRole('officer', 'admin', 'reception'), (req, res) =>
  handle(req, res, () => {
    const r = Queue.setPriority({
      tokenId: req.params.id,
      priority: req.body && req.body.priority,
      reason: req.body && req.body.reason,
      actorId: req.user.id,
      actorName: req.user.name,
    });
    r.action = 'priority_changed';
    return r;
  })
);

// Estimate
router.post('/:id/estimate', requireAuth, requireRole('officer', 'admin', 'reception'), (req, res) => {
  const token = Token.findById(req.params.id);
  if (!token) return res.status(404).json({ error: 'Token not found' });
  const body = req.body || {};
  const result = Queue.doEstimate({
    tokenId: token.id,
    estimatedWaitMinutes: body.estimatedWaitMinutes,
    estimatedServiceTime: body.estimatedServiceTime,
    actorId: req.user.id,
    actorName: req.user.name,
  });
  if (!result.ok) return res.status(400).json({ error: result.error });
  broadcast(req.app, result.token, { action: 'estimate_updated' });
  res.json({ token: result.token, notifications: result.notifications });
});

// Call next token in an area
router.post('/next', requireAuth, officer, (req, res) => {
  const { areaId, counterId } = req.body || {};
  if (!areaId) return res.status(400).json({ error: 'areaId is required' });
  const result = Queue.next(areaId, counterId);
  if (!result.ok) return res.status(409).json({ error: result.error });
  Queue.doCall({ tokenId: result.token.id, counterId, actorId: req.user.id, actorName: req.user.name });
  const token = Token.findById(result.token.id);
  const estimates = Queue.calculateEstimates(token);
  broadcast(req.app, token, { action: 'called', ...estimates });
  res.json({ token, ...estimates });
});

export default router;