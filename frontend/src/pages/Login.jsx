import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api from '../services/api.js';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@kims.in', pass: 'admin123', phone: '+91 9000000001' },
  { role: 'Officer', email: 'officer@kims.in', pass: 'officer123', phone: '+91 9000000002' },
  { role: 'Reception', email: 'reception@kims.in', pass: 'reception123', phone: '+91 9000000003' },
];

export default function Login() {
  const { login, loginOtp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [authMode, setAuthMode] = useState('phone'); // 'phone' | 'email'

  // Phone OTP state
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('phone'); // phone | otp
  const [devOtp, setDevOtp] = useState(null);

  // Email password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function requestOtp(e) {
    if (e) e.preventDefault();
    const p = (phone || '').trim();
    if (!p) return toast.error('Enter your registered phone number');
    setLoading(true);
    setError(null);
    try {
      const d = await api.otpRequest(p);
      setDevOtp(d.devOtp || null);
      setStep('otp');
      toast.success(d.devOtp ? `One-time code: ${d.devOtp}` : 'OTP sent to your phone');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verify(e) {
    if (e) e.preventDefault();
    if (!otp.trim()) return toast.error('Enter the OTP');
    setLoading(true);
    setError(null);
    try {
      const user = await loginOtp((phone || '').trim(), otp.trim());
      toast.success(`Welcome, ${user.name}`);
      navigate('/staff');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailLogin(e) {
    if (e) e.preventDefault();
    if (!email.trim() || !password) {
      return toast.error('Enter both email and password');
    }
    setLoading(true);
    setError(null);
    try {
      const user = await login(email.trim(), password);
      toast.success(`Welcome, ${user.name}`);
      navigate('/staff');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function fillPhone(acc) {
    setPhone(acc.phone);
    setOtp('');
    setStep('phone');
    setError(null);
  }

  function fillEmail(acc) {
    setEmail(acc.email);
    setPassword(acc.pass);
    setError(null);
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card shadow-lg">
        <h1 className="mb-1 text-2xl font-extrabold text-slate-900">KIMS Staff Login</h1>
        <p className="mb-4 text-sm text-slate-500">
          Sign in to the KIMS Queue & Consultation Control Center.
        </p>

        {/* Tab switch between Phone OTP and Email/Password */}
        <div className="mb-5 flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
              authMode === 'phone' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'
            }`}
            onClick={() => { setAuthMode('phone'); setError(null); }}
          >
            📱 Phone (OTP)
          </button>
          <button
            type="button"
            className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${
              authMode === 'email' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-900'
            }`}
            onClick={() => { setAuthMode('email'); setError(null); }}
          >
            ✉️ Email & Password
          </button>
        </div>

        {error && <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        {authMode === 'phone' ? (
          step === 'phone' ? (
            <form onSubmit={requestOtp} className="space-y-4">
              <div>
                <label className="label" htmlFor="login-phone">Registered phone number</label>
                <input
                  id="login-phone"
                  className="input"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 9000000001 or 9000000001"
                  autoComplete="tel"
                />
              </div>

              {/* Demo quick buttons */}
              <div>
                <span className="text-[11px] font-semibold text-slate-400">Quick fill demo accounts:</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {DEMO_ACCOUNTS.map((d) => (
                    <button
                      key={d.role}
                      type="button"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      onClick={() => fillPhone(d)}
                    >
                      {d.role}
                    </button>
                  ))}
                </div>
              </div>

              <button className="btn-primary w-full font-bold" disabled={loading}>
                {loading ? 'Sending OTP…' : 'Send One-Time Passcode'}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-slate-500">OTP sent for <span className="font-semibold">{phone}</span></p>
              <div>
                <label className="label" htmlFor="login-otp">One-time passcode</label>
                <input
                  id="login-otp"
                  className="input"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                />
                {devOtp && (
                  <p className="field-hint">One-time code: <strong>{devOtp}</strong></p>
                )}
              </div>
              <button className="btn-primary w-full font-bold" disabled={loading}>
                {loading ? 'Verifying…' : 'Verify & Sign in'}
              </button>
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => { setStep('phone'); setOtp(''); setDevOtp(null); setError(null); }}
              >
                Change phone
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="label" htmlFor="login-email">Staff Email</label>
              <input
                id="login-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@kims.in"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label" htmlFor="login-password">Password</label>
              <input
                id="login-password"
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {/* Demo quick buttons */}
            <div>
              <span className="text-[11px] font-semibold text-slate-400">Quick fill demo credentials:</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {DEMO_ACCOUNTS.map((d) => (
                  <button
                    key={d.role}
                    type="button"
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    onClick={() => fillEmail(d)}
                  >
                    {d.role}
                  </button>
                ))}
              </div>
            </div>

            <button className="btn-primary w-full font-bold" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}