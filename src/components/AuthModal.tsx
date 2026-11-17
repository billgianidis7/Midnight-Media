import { useState } from 'react';
import { User } from 'firebase/auth';
import { CheckCircle2, MailCheck, RefreshCw, X } from 'lucide-react';
import {
  emailSignIn,
  emailSignUp,
  reloadCurrentUser,
  resendVerificationEmail,
} from '../lib/firebase';
import { GoogleSignInButton } from './GoogleSignInButton';

interface AuthModalProps {
  open: boolean;
  user: User | null;
  onClose: () => void;
  onGoogleFastLogin: () => Promise<void>;
  onEmailAuthSuccess: (user: User) => void;
}

export function AuthModal({
  open,
  user,
  onClose,
  onGoogleFastLogin,
  onEmailAuthSuccess,
}: AuthModalProps) {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);

  if (!open) return null;

  const formatAuthError = (err: unknown): string => {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('auth/operation-not-allowed')) {
      return 'Email/Password sign-in is not yet enabled in Firebase Console Authentication. Use Google Fast Login above, or enable Email/Password in Firebase Auth settings.';
    }
    if (msg.includes('auth/email-already-in-use')) {
      return 'An account with this email already exists. Switch to Sign In or use Google Fast Login.';
    }
    if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password')) {
      return 'Invalid email or password. Please check your credentials and try again.';
    }
    if (msg.includes('auth/weak-password')) {
      return 'Password must be at least 6 characters.';
    }
    if (msg.includes('auth/popup-closed-by-user')) {
      return 'Google sign-in popup was closed before completing.';
    }
    return msg;
  };

  const handleGoogleClick = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);
    setGoogleLoading(true);
    try {
      await onGoogleFastLogin();
      onClose();
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNoticeMsg(null);
    setLoading(true);
    try {
      if (tab === 'signup') {
        const res = await emailSignUp(displayName, email, password);
        onEmailAuthSuccess(res.user);
        if (res.user.emailVerified) {
          onClose();
        } else {
          setNoticeMsg(
            res.verificationSent
              ? 'Account created. A verification link was sent to your email — verify your address (or use Google Fast Login) to unlock cloud uploads.'
              : 'Account created. Please verify your email or use Google Fast Login.'
          );
        }
      } else {
        const res = await emailSignIn(email, password);
        onEmailAuthSuccess(res.user);
        if (res.user.emailVerified) {
          onClose();
        } else {
          setNoticeMsg(
            'Signed in, but your email is not verified yet. Check your inbox or click Resend below.'
          );
        }
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await resendVerificationEmail();
      setNoticeMsg('Verification email resent. Check your inbox and spam folder.');
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerified = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const updated = await reloadCurrentUser();
      if (updated?.emailVerified) {
        onEmailAuthSuccess(updated);
        onClose();
      } else {
        setNoticeMsg('Email is still unverified. Click the link in your inbox first, then refresh.');
      }
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md border border-white/15 bg-[#0b0b0f] p-6 md:p-8 space-y-6 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-400">
              00:00 Studio Access
            </p>
            <h2 id="auth-modal-title" className="font-display text-2xl font-bold text-white mt-1">
              {tab === 'signin' ? 'Member Sign In' : 'Create Studio Account'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-1.5 cursor-pointer"
            aria-label="Close studio access dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sign In / Sign Up Tabs */}
        <div className="grid grid-cols-2 border border-white/15">
          <button
            type="button"
            onClick={() => {
              setTab('signin');
              setErrorMsg(null);
              setNoticeMsg(null);
            }}
            className={`py-2.5 text-xs uppercase tracking-[0.16em] cursor-pointer transition-colors ${
              tab === 'signin'
                ? 'bg-white text-black font-semibold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('signup');
              setErrorMsg(null);
              setNoticeMsg(null);
            }}
            className={`py-2.5 text-xs uppercase tracking-[0.16em] cursor-pointer transition-colors ${
              tab === 'signup'
                ? 'bg-white text-black font-semibold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Google Fast Login */}
        <div className="border border-white/10 bg-[#08080b] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-300 font-semibold">
              Google Fast Login
            </span>
            <span className="text-[11px] text-zinc-500">Unlocks Drive &amp; Studio</span>
          </div>
          <div className="flex justify-center">
            <GoogleSignInButton
              onClick={handleGoogleClick}
              disabled={googleLoading || loading}
              label={
                googleLoading
                  ? 'Connecting...'
                  : tab === 'signup'
                  ? 'Sign up fast with Google'
                  : 'Log in fast with Google'
              }
            />
          </div>
        </div>

        {/* Unverified Email Notice Bar if already signed in unverified */}
        {user && !user.emailVerified && (
          <div className="border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2.5 text-xs text-amber-200">
            <p className="flex items-center gap-2 font-medium">
              <MailCheck className="w-4 h-4 shrink-0" />
              Verify {user.email} to publish and manage uploads.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCheckVerified}
                disabled={loading}
                className="px-3 py-1.5 bg-white text-black text-[11px] font-semibold uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                I Verified — Refresh
              </button>
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="px-3 py-1.5 border border-white/25 text-white text-[11px] uppercase tracking-wider cursor-pointer"
              >
                Resend Email
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          <span className="h-px flex-1 bg-white/10" />
          <span>or with email</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>

        {/* Email / Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'signup' && (
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
                Artist / Account Name
              </label>
              <input
                type="text"
                required
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. 00:00"
                className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
              />
            </div>
          )}

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-400 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full bg-[#08080b] border border-white/15 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/40"
            />
          </div>

          {noticeMsg && (
            <p className="text-xs text-zinc-200 border border-white/20 bg-white/5 px-3 py-2.5 flex items-start gap-2 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 text-zinc-300 shrink-0 mt-0.5" />
              <span>{noticeMsg}</span>
            </p>
          )}

          {errorMsg && (
            <p className="text-xs text-red-400 border border-red-500/30 bg-red-500/10 px-3 py-2.5 leading-relaxed">
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full py-2.5 text-xs font-semibold uppercase tracking-[0.16em] bg-white text-black hover:bg-zinc-200 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {loading
              ? 'Please wait...'
              : tab === 'signup'
              ? 'Create Account'
              : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
