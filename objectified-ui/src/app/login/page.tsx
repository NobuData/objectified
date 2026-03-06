'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import { SiGithub } from 'react-icons/si';
import Image from 'next/image';
import * as Dialog from '@radix-ui/react-dialog';
import { Skeleton } from '@radix-ui/themes';

const CREDENTIALS_ERROR = 'CredentialsSignin';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [providers, setProviders] = useState<Awaited<ReturnType<typeof getProviders>>>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  // Show error from URL when NextAuth redirects back after failed credentials (e.g. ?error=CredentialsSignin)
  const urlError = useMemo(() => {
    const error = searchParams.get('error');
    return error === CREDENTIALS_ERROR ? 'Invalid email or password.' : '';
  }, [searchParams]);

  const error = submitError || urlError;

  // Auto-dismiss alert after 5 seconds when error is shown
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => {
      setSubmitError('');
      router.replace('/login', { scroll: false });
    }, 5000);
    return () => clearTimeout(timer);
  }, [error, router]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    getProviders()
    .then(setProviders)
    .catch((err) => {
      console.error('Failed to load auth providers', err);
      setProviders(null);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSubmitError('');

    try {
      // Use redirect: true so NextAuth performs a full redirect on success/failure.
      // On success: redirects to callbackUrl (/dashboard). On failure: redirects to /login?error=CredentialsSignin.
      await signIn('credentials', {
        email,
        password,
        callbackUrl: '/dashboard',
        redirect: true,
      });
      // If we get here, redirect did not happen (e.g. signIn returned without redirect in edge cases).
      setLoading(false);
    } catch {
      setSubmitError('Invalid email or password.');
      setLoading(false);
    }
  };

  const handleGitHubSignIn = async () => {
    if (loading) {
      return;
    }

    setSubmitError('');
    setLoading(true);

    try {
      await signIn('github', { callbackUrl: '/dashboard' });
    } finally {
      setLoading(false);
    }
  };

  // Use theme only after mount to avoid hydration mismatch (resolvedTheme differs SSR vs client)
  const isDark = mounted ? resolvedTheme === 'dark' : false;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30 dark:from-slate-950 dark:via-indigo-950/30 dark:to-purple-950/30">
      {/* Error alert at top of page; auto-dismisses after 5 seconds */}
      {error && (
        <div
          role="alert"
          className="fixed top-0 left-0 right-0 z-[10000] flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white text-sm font-medium shadow-lg dark:bg-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* Logging in modal: blocks interaction and shows centered message */}
      <Dialog.Root open={loading} onOpenChange={() => {}}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10001] cursor-not-allowed" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10002] w-full max-w-xs bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 flex flex-col items-center gap-4"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
            aria-describedby={undefined}
          >
            <Loader2
              className="h-10 w-10 text-indigo-600 dark:text-indigo-400 animate-spin"
              aria-hidden
            />
            <Dialog.Title className="sr-only">Logging in</Dialog.Title>
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100" id="logging-in-message">
              Logging in ...
            </p>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-indigo-200/40 to-purple-200/40 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-200/40 to-cyan-200/40 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl shadow-indigo-500/10 dark:shadow-indigo-500/5 p-8 border border-white/50 dark:border-gray-700/50">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 blur-xl opacity-20 rounded-full scale-150" />
              <Image
                src={isDark ? '/Objectified-05.png' : '/Objectified-02.png'}
                alt="Objectified Logo"
                width={200}
                height={56}
                className="relative w-auto h-14 object-contain"
              />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-indigo-900 to-gray-900 dark:from-gray-100 dark:via-indigo-200 dark:to-gray-100 bg-clip-text text-transparent mb-3">
              Welcome Back
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              Sign in to continue to your workspace
            </p>
          </div>

          {providers === null ? (
            /* Skeleton loading area while login options (credentials + GitHub/SSO) are loading */
            <div className="space-y-5" role="status" aria-label="Loading login options">
              <div className="space-y-2">
                <Skeleton height="16px" width="64px" />
                <Skeleton height="48px" width="100%" style={{ borderRadius: '12px' }} />
              </div>
              <div className="space-y-2">
                <Skeleton height="16px" width="80px" />
                <Skeleton height="48px" width="100%" style={{ borderRadius: '12px' }} />
              </div>
              <Skeleton height="48px" width="100%" style={{ borderRadius: '12px' }} />
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200 dark:border-gray-600" />
                </div>
                <div className="relative flex justify-center">
                  <Skeleton height="16px" width="96px" />
                </div>
              </div>
              <Skeleton height="48px" width="100%" style={{ borderRadius: '12px' }} />
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Email
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail size={18} className="text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="block w-full pl-11 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400 bg-gray-50/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 focus:bg-white dark:focus:bg-gray-800 transition-all duration-200"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock size={18} className="text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="block w-full pl-11 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400 bg-gray-50/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 focus:bg-white dark:focus:bg-gray-800 transition-all duration-200"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-3.5 rounded-xl font-semibold transition-all duration-200 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

            {providers?.github && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-600" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-white/80 dark:bg-gray-900/80 px-3 text-gray-500 dark:text-gray-400">
                      or continue with
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGitHubSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 border border-gray-200 dark:border-gray-600 rounded-xl font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                >
                  <SiGithub size={20} className="shrink-0" aria-hidden />
                  Sign in with GitHub
                </button>
              </>
            )}
          </form>
          )}
        </div>
      </div>
    </div>
  );
}
