/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Lock, Sparkles, ShieldCheck, AlertCircle } from 'lucide-react';

interface LandingPageProps {
  onSignIn: () => void;
  isLoading: boolean;
  errorMessage: string | null;
  onClearError: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onSignIn,
  isLoading,
  errorMessage,
  onClearError,
}) => {
  return (
    <main
      id="landing-page-root"
      className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8"
    >
      <div className="w-full max-w-xl text-center">
        {/* Monogram Badge */}
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-900 font-serif text-3xl font-bold tracking-widest text-slate-50 shadow-md ring-1 ring-slate-900/10">
          TK
        </div>

        {/* Heading & Subtitle */}
        <h1
          id="landing-title"
          className="font-serif text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl"
        >
          ThoughtKeep
        </h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
          A calm, private sanctuary for your daily thoughts, reflections, and brainstorming.
          Engage in thoughtful multi-turn dialogue with AI while retaining complete control over your journal data.
        </p>

        {/* Error notification banner if sign in fails */}
        {errorMessage && (
          <div
            id="landing-error-banner"
            className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-left text-sm text-rose-800"
            role="alert"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <div className="flex-1">
              <p className="font-medium">Unable to complete sign in</p>
              <p className="mt-1 text-rose-700">{errorMessage}</p>
            </div>
            <button
              id="dismiss-landing-error-btn"
              type="button"
              onClick={onClearError}
              className="text-rose-500 hover:text-rose-700"
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}

        {/* Single Sign in with Google Button (The ONLY auth method) */}
        <div className="mt-10 flex flex-col items-center justify-center gap-4">
          <button
            id="google-signin-btn"
            type="button"
            onClick={onSignIn}
            disabled={isLoading}
            className="group relative inline-flex w-full max-w-sm items-center justify-center gap-3 rounded-2xl border border-slate-300 bg-white px-6 py-4 text-base font-medium text-slate-800 shadow-sm transition-all hover:bg-slate-50 hover:border-slate-400 hover:shadow-md focus:outline-hidden focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <span className="flex items-center gap-2 text-slate-600">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
                Connecting to Google...
              </span>
            ) : (
              <>
                {/* Clean Google G SVG Icon */}
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    fill="#EA4335"
                  />
                </svg>
                <span>Sign in with Google</span>
              </>
            )}
          </button>
        </div>

        {/* Quiet Security Highlights */}
        <div className="mt-14 grid grid-cols-1 gap-6 border-t border-slate-200/80 pt-10 text-left sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-slate-800">
              <Lock className="h-4 w-4 text-slate-700" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Owner-Bound
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Your entries are stored exclusively in your own private database path with strict security rules.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-slate-800">
              <Sparkles className="h-4 w-4 text-slate-700" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Streaming Reflection
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Stream responsive observations and brainstorm freely with server-side AI key isolation.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-slate-800">
              <ShieldCheck className="h-4 w-4 text-slate-700" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Explicit Control
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Conversations end and save only when you decide. No automatic triggers, zero hidden telemetry.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
};
