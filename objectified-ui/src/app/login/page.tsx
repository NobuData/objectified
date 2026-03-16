'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { getProviders, signIn } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Mail, Lock, Loader2, AlertCircle } from 'lucide-react';
import { SiGithub } from 'react-icons/si';
import Image from 'next/image';
import * as Dialog from '@radix-ui/react-dialog';
import { Skeleton } from '@radix-ui/themes';

const CREDENTIALS_ERROR = 'CredentialsSignin';

function LoginFormSkeleton() {
  return (
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
          <div className="w-full login-skeleton-divider" />
        </div>
        <div className="relative flex justify-center">
          <Skeleton height="16px" width="96px" />
        </div>
      </div>
      <Skeleton height="48px" width="100%" style={{ borderRadius: '12px' }} />
    </div>
  );
}

function LoginPageContent() {
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
      // On success: redirects to callbackUrl (/). On failure: redirects to /login?error=CredentialsSignin.
      await signIn('credentials', {
        email,
        password,
        callbackUrl: '/',
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
      await signIn('github', { callbackUrl: '/' });
    } finally {
      setLoading(false);
    }
  };

  // Use theme only after mount to avoid hydration mismatch (resolvedTheme differs SSR vs client)
  const isDark = mounted ? resolvedTheme === 'dark' : false;

  return (
    <div className="login-page">
      {/* Error alert at top of page; auto-dismisses after 5 seconds */}
      {error && (
        <div
          role="alert"
          className="login-error-alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* Logging in modal: blocks interaction and shows centered message */}
      <Dialog.Root open={loading} onOpenChange={() => {}}>
        <Dialog.Portal>
          <Dialog.Overlay className="login-modal-overlay" />
          <Dialog.Content
            className="login-modal-content"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
            aria-describedby={undefined}
          >
            <Loader2
              className="h-10 w-10 login-spinner"
              aria-hidden
            />
            <Dialog.Title className="sr-only">Logging in</Dialog.Title>
            <Dialog.Description className="login-modal-text">
              Logging in ...
            </Dialog.Description>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="login-orb-1" />
      <div className="login-orb-2" />

      <div className="login-card-wrapper">
        <div className="login-card">
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
            <h1 className="login-heading">
              Welcome Back
            </h1>
            <p className="login-subtitle">
              Sign in to continue to your workspace
            </p>
          </div>

          {(providers === null || Object.keys(providers).length === 0) ? (
            /* Skeleton loading area while login options (credentials + GitHub/SSO) are loading */
            <LoginFormSkeleton />
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="login-label"
              >
                Email
              </label>
              <div className="relative login-input-group">
                <div className="login-input-icon-wrap">
                  <Mail size={18} className="login-input-icon" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="login-input"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="login-label"
              >
                Password
              </label>
              <div className="relative login-input-group">
                <div className="login-input-icon-wrap">
                  <Lock size={18} className="login-input-icon" />
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="login-input"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="login-btn-primary"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

            {providers?.github && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full login-divider-line" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="login-divider-text">
                      or continue with
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGitHubSignIn}
                  disabled={loading}
                  className="login-btn-secondary"
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

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageSkeletonFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageSkeletonFallback() {
  return (
    <div className="login-page">
      <div className="login-orb-1" />
      <div className="login-orb-2" />
      <div className="login-card-wrapper">
        <div className="login-card">
          <div className="flex justify-center mb-8">
            <div className="h-14 w-[200px] rounded-lg login-skeleton-placeholder" />
          </div>
          <div className="text-center mb-8">
            <div className="h-9 w-48 mx-auto rounded login-skeleton-placeholder mb-3" />
            <div className="h-4 w-64 mx-auto rounded login-skeleton-placeholder" />
          </div>
          <LoginFormSkeleton />
        </div>
      </div>
    </div>
  );
}
