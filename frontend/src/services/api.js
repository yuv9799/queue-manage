// API base URL.
// - Local dev: uses VITE_API_URL if set, otherwise the dev backend on localhost.
// - Production: MUST set VITE_API_URL at build time to the deployed backend URL.
//   (GitHub Pages is static-only and cannot host the Express backend.)
const CONFIGURED_BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const IS_DEV = import.meta.env.DEV === true;
const BASE = CONFIGURED_BASE || (IS_DEV ? 'http://localhost:8080' : null);

async function request(path, { method = 'GET', body, token } = {}) {
  if (!BASE) {
    const err = new Error(
      'Backend API is not configured. Set VITE_API_URL at build time to your deployed backend URL.'
    );
    err.status = 0;
    throw err;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  BASE,

  // Auth
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: (token) => request('/auth/me', { token }),
  register: (payload, token) => request('/auth/register', { method: 'POST', body: payload, token }),

  // Departments / Areas / Counters
  departments: (token) => request('/departments', { token }),
  createDepartment: (p, token) => request('/departments', { method: 'POST', body: p, token }),
  updateDepartment: (id, p, token) => request(`/departments/${id}`, { method: 'PUT', body: p, token }),
  deleteDepartment: (id, token) => request(`/departments/${id}`, { method: 'DELETE', token }),

  areas: (token, departmentId) =>
    request(`/areas${departmentId ? `?departmentId=${departmentId}` : ''}`, { token }),
  createArea: (p, token) => request('/areas', { method: 'POST', body: p, token }),
  updateArea: (id, p, token) => request(`/areas/${id}`, { method: 'PUT', body: p, token }),
  deleteArea: (id, token) => request(`/areas/${id}`, { method: 'DELETE', token }),

  counters: (token, areaId) =>
    request(`/counters${areaId ? `?areaId=${areaId}` : ''}`, { token }),
  createCounter: (p, token) => request('/counters', { method: 'POST', body: p, token }),
  updateCounter: (id, p, token) => request(`/counters/${id}`, { method: 'PUT', body: p, token }),
  deleteCounter: (id, token) => request(`/counters/${id}`, { method: 'DELETE', token }),

  // Tokens
  issueToken: (departmentId, areaId, patientName, preferredDoctorId, phone) =>
    request('/tokens', {
      method: 'POST',
      body: { departmentId, areaId, patientName, preferredDoctorId, phone },
    }),
  issueTokenFull: (body, token) => request('/tokens', { method: 'POST', body, token }),
  tokenById: (id) => request(`/tokens/${id}`),
  tokenStatus: (id) => request(`/tokens/${id}/status`),
  tokenByNumber: (number) => request(`/tokens/by-number/${number}`),
  live: (areaId) => request(`/tokens/live${areaId ? `?areaId=${areaId}` : ''}`),
  tokens: (params = {}, token) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''))
    ).toString();
    return request(`/tokens${q ? `?${q}` : ''}`, { token });
  },
  callToken: (id, counterId, token) =>
    request(`/tokens/${id}/call`, { method: 'POST', body: { counterId }, token }),
  nextToken: (areaId, counterId, token) =>
    request('/tokens/next', { method: 'POST', body: { areaId, counterId }, token }),
  skipToken: (id, token) => request(`/tokens/${id}/skip`, { method: 'POST', token }),
  holdToken: (id, token) => request(`/tokens/${id}/hold`, { method: 'POST', token }),
  completeToken: (id, token) => request(`/tokens/${id}/complete`, { method: 'POST', token }),
  cancelToken: (id, token) => request(`/tokens/${id}/cancel`, { method: 'POST', token }),
  tokenServe: (id, token) => request(`/tokens/${id}/serve`, { method: 'POST', token }),
  tokenStart: (id, token) => request(`/tokens/${id}/start`, { method: 'POST', token }),
  tokenRecall: (id, counterId, token) =>
    request(`/tokens/${id}/recall`, { method: 'POST', body: { counterId }, token }),
  tokenNoShow: (id, token) => request(`/tokens/${id}/no-show`, { method: 'POST', token }),
  tokenEstimate: (id, payload, token) =>
    request(`/tokens/${id}/estimate`, { method: 'POST', body: payload, token }),
  tokenPriority: (id, priority, reason, token) =>
    request(`/tokens/${id}/priority`, { method: 'POST', body: { priority, reason }, token }),
  tokenReassignDoctor: (id, doctorId, reason, token) =>
    request(`/tokens/${id}/assign-doctor`, { method: 'POST', body: { doctorId, reason }, token }),
  tokenAssignDoctor: (id, doctorId, note, token) =>
    request(`/tokens/${id}/assign-doctor`, { method: 'POST', body: { doctorId, reason: note }, token }),

  // Doctors
  doctors: (params = {}, token) => {
    if (typeof params === 'string') {
      return request('/doctors', { token: params });
    }
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''))
    ).toString();
    return request(`/doctors${q ? `?${q}` : ''}`, { token });
  },

  // Public doctors endpoint — no auth required, always returns active doctors without patient names
  doctorsPublic: (params = {}) => {
    const q = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== ''))
    ).toString();
    return request(`/doctors/public${q ? `?${q}` : ''}`);
  },
  doctorById: (id, token) => request(`/doctors/${id}`, { token }),
  doctorQueue: (id, token) => request(`/doctors/${id}/queue`, { token }),
  createDoctor: (p, token) => request('/doctors', { method: 'POST', body: p, token }),
  updateDoctor: (id, p, token) => request(`/doctors/${id}`, { method: 'PUT', body: p, token }),
  deleteDoctor: (id, token) => request(`/doctors/${id}`, { method: 'DELETE', token }),
  doctorStatus: (id, status, token) =>
    request(`/doctors/${id}/status`, { method: 'POST', body: { status }, token }),

  // Stats
  overview: (token) => request('/stats/overview', { token }),
  hourly: (token) => request('/stats/hourly', { token }),
  queueDepth: (token) => request('/stats/queue-depth', { token }),
  byDepartment: (token) => request('/stats/by-department', { token }),
  statusToday: (token) => request('/stats/status', { token }),

  // Reviews
  toQueryString: (params) => {
    const chunks = [];
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null || v === '') continue;
      chunks.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return chunks.join('&');
  },
  reviews: (params) => {
    const q = api.toQueryString(params);
    return request(`/reviews${q ? `?${q}` : ''}`);
  },
  reviewSummary: () => request('/reviews/summary'),
  reviewAnalytics: (token) => request('/reviews/analytics', { token }),
  submitReview: (payload, token) =>
    request('/reviews', { method: 'POST', body: payload, token: token || undefined }),
  reviewsAdmin: (params, token) => {
    const q = api.toQueryString(params);
    return request(`/reviews/admin${q ? `?${q}` : ''}`, { token });
  },
  reviewStatus: (id, status, token) =>
    request(`/reviews/${id}/status`, { method: 'PATCH', body: { status }, token }),
  deleteReview: (id, token) => request(`/reviews/${id}`, { method: 'DELETE', token }),

  // Emergency
  sosCreate: (payload) => request('/emergency/sos', { method: 'POST', body: payload }),
  sosGet: (id) => request(`/emergency/sos/${id}`),
  sosList: (params, token) => {
    const q = api.toQueryString(params);
    return request(`/emergency/sos${q ? `?${q}` : ''}`, { token });
  },
  sosAction: (id, action, token) =>
    request(`/emergency/sos/${id}/${action}`, { method: 'POST', token }),
  helpPoints: () => request('/emergency/help-points'),
  nearestHelpPoint: (lat, lng) => request(`/emergency/help-points/nearest?lat=${lat}&lng=${lng}`),

  // ================= Staff Control Center =================
  otpRequest: (phone) => request('/auth/otp/request', { method: 'POST', body: { phone } }),
  otpVerify: (phone, otp) => request('/auth/otp/verify', { method: 'POST', body: { phone, otp } }),

  // Patients
  patientSearch: (q, token) => request(`/patients/search?q=${encodeURIComponent(q)}`, { token }),
  createPatient: (p, token) => request('/patients', { method: 'POST', body: p, token }),
  patient: (id, token) => request(`/patients/${id}`, { token }),
  patientTokens: (id, token) => request(`/patients/${id}/tokens`, { token }),

  // Queues
  queueLive: (token) => request('/queues/live', { token }),
  queueUnassigned: (token) => request('/queues/unassigned', { token }),

  // Assignments
  assignmentRecommend: (tokenId, preferDoctorId, token) =>
    request('/assignments/recommend', { method: 'POST', body: { tokenId, preferDoctorId }, token }),
  assignmentCreate: (p, token) => request('/assignments', { method: 'POST', body: p, token }),
  redistributePreview: (doctorId, token) =>
    request('/assignments/redistribute-preview', { method: 'POST', body: { doctorId }, token }),
  redistributeConfirm: (p, token) => request('/assignments/redistribute', { method: 'POST', body: p, token }),

  // Notifications / Audit / Dashboard
  notifications: (tokenId, token) => request(`/notifications${tokenId ? `?tokenId=${tokenId}` : ''}`, { token }),
  audit: (limit, token) => request(`/audit${limit ? `?limit=${limit}` : ''}`, { token }),
  staffDashboard: (token) => request('/staff/dashboard', { token }),
};

export default api;