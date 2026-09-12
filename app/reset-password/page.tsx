'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecking(false);
    });

    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
        setChecking(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setLoading(true);
    const { error } = await supabaseBrowser.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError('The update failed. Request a new link from the login page.');
      return;
    }
    setSuccess(true);
    setTimeout(() => router.push('/kitchen'), 1500);
  }

  if (checking) {
    return <div className="p-6 text-center text-ink/60">Verifying link…</div>;
  }

  if (!ready) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4 text-center">
        <h1 className="mb-3 font-display text-2xl text-forest">Invalid or expired link</h1>
        <p className="mb-6 text-sm text-ink/70">
          Request a new reset link from the login page.
        </p>
        <button
          onClick={() => router.push('/login')}
          className="rounded-lg bg-forest px-4 py-3 font-medium text-cream"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 font-display text-2xl text-forest">New password</h1>
      <p className="mb-6 text-sm text-ink/60">Choose a new password for your staff account.</p>

      {success ? (
        <p className="text-sm text-forest">Password updated. Redirecting…</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-ink/70">New password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink/70">Confirm password</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-ink"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-forest px-4 py-3 font-medium text-cream disabled:opacity-60"
          >
            {loading ? 'Saving…' : 'Save password'}
          </button>
        </form>
      )}
    </div>
  );
}

