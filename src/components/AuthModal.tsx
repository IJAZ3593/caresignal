import { useState, type FormEvent } from 'react';
import { signInWithPopup, type User } from 'firebase/auth';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { auth, googleProvider } from '../lib/firebase';
import { ensureUserProfile } from '../lib/firestoreSync';
import type { AuthUser } from '../lib/types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
  onFirebaseSuccess?: (firebaseUser: User) => void;
}

export function AuthModal({ open, onClose, onSuccess, onFirebaseSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AuthUser['role']>('Clinic Staff');
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.signup({ name, email, password, role });
      onSuccess(result.user);
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setGoogleSubmitting(true);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      await ensureUserProfile(credential.user);
      onFirebaseSuccess?.(credential.user);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setError(msg);
      }
    } finally {
      setGoogleSubmitting(false);
    }
  }

  function fillDemoCredentials() {
    setMode('login');
    setEmail('clinic.staff@caresignal.demo');
    setPassword('CareSignal2026!');
    setError(null);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="auth-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 dark:bg-slate-950/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
        >
          <motion.div
            key="auth-modal-panel"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg"
          >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
          <h2 id="auth-modal-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {mode === 'login' ? 'Sign in to CareSignal' : 'Create clinic staff account'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="rounded-lg p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-teal-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pt-4 space-y-3">
          <button
            type="button"
            disabled={googleSubmitting}
            onClick={() => void handleGoogleSignIn()}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 transition-colors"
          >
            <span>{googleSubmitting ? 'Connecting to Google...' : 'Continue with Google (Cloud Workspace)'}</span>
          </button>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            <span>or clinic staff session</span>
            <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                mode === 'signup'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Sign up
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/50 px-3.5 py-2.5 text-xs text-red-800 dark:text-red-300"
            >
              {error}
            </div>
          )}

          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-name" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Full name
              </label>
              <input
                id="auth-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dr. Elena Brooks"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Clinic email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@clinic.demo"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label htmlFor="auth-role" className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                Clinic role
              </label>
              <select
                id="auth-role"
                value={role}
                onChange={(e) => setRole(e.target.value as AuthUser['role'])}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
              >
                <option value="Clinic Staff">Clinic Staff</option>
                <option value="Clinic Manager">Clinic Manager</option>
              </select>
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60 transition-colors"
            >
              {submitting
                ? mode === 'login'
                  ? 'Signing in...'
                  : 'Creating account...'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
            </button>

            {mode === 'login' && (
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                Fill demo staff credentials
              </button>
            )}
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Accounts are stored locally in this demo workspace using salted scrypt password hashes and HTTP-only session cookies.
          </p>
        </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
