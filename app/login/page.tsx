'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase-browser';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError('Email ou mot de passe incorrect.');
      return;
    }
    router.push('/kitchen');
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError("Impossible d'envoyer l'email. Vérifie l'adresse et réessaie.");
      return;
    }
    setInfo('Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé.');
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4">
      <h1 className="mb-1 font-display text-2xl text-forest">Espace staff</h1>
      <p className="mb-6 text-sm text-ink/60">SOS Caffè — connexion cuisine / admin</p>

      {mode === 'login' ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-ink/70">Email</label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-ink"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-ink/70">Mot de passe</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-ink"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-forest px-4 py-3 font-medium text-cream disabled:opacity-60"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('forgot');
              setError(null);
              setInfo(null);
            }}
            className="text-sm text-ink/60 underline"
          >
            Mot de passe oublié ?
          </button>
        </form>
      ) : (
        <form onSubmit={handleForgotPassword} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-ink/70">Email</label>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-ink/20 bg-white px-3 py-2 text-ink"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-forest">{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-forest px-4 py-3 font-medium text-cream disabled:opacity-60"
          >
            {loading ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setInfo(null);
            }}
            className="text-sm text-ink/60 underline"
          >
            Retour à la connexion
          </button>
        </form>
      )}
    </div>
  );
}

