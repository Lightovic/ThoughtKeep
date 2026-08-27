/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BookOpen, PenLine, LogOut, ShieldCheck } from 'lucide-react';
import type { UserProfile } from '../types.ts';

interface NavbarProps {
  user: UserProfile | null;
  activeView: 'journal' | 'history';
  historyCount: number;
  onNavigate: (view: 'journal' | 'history') => void;
  onOpenSecurity: () => void;
  onRequestSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeView,
  historyCount,
  onNavigate,
  onOpenSecurity,
  onRequestSignOut,
}) => {
  return (
    <header
      id="main-navbar"
      className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Monogram and Title */}
        <div className="flex items-center gap-3">
          <div
            id="tk-monogram-logo"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 font-serif text-sm font-semibold tracking-wider text-slate-50 shadow-xs ring-1 ring-slate-900/10"
            title="ThoughtKeep"
          >
            TK
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-base font-semibold tracking-tight text-slate-900">
              ThoughtKeep
            </span>
            <span className="hidden text-[11px] font-medium tracking-wide text-slate-400 sm:inline-block">
              Private AI Journal
            </span>
          </div>
        </div>

        {/* Center: Navigation Controls (Only if signed in) */}
        {user && (
          <nav id="navbar-view-navigation" className="flex items-center gap-1 sm:gap-2">
            <button
              id="nav-journal-tab-btn"
              type="button"
              onClick={() => onNavigate('journal')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all ${
                activeView === 'journal'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <PenLine className="h-4 w-4" />
              <span>Journal</span>
            </button>
            <button
              id="nav-history-tab-btn"
              type="button"
              onClick={() => onNavigate('history')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all ${
                activeView === 'history'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <BookOpen className="h-4 w-4" />
              <span>History</span>
              {historyCount > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                    activeView === 'history'
                      ? 'bg-slate-700 text-slate-200'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {historyCount}
                </span>
              )}
            </button>
          </nav>
        )}

        {/* Right: Security info & Sign out */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            id="open-security-modal-btn"
            type="button"
            onClick={onOpenSecurity}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-300"
            title="View Security & Privacy Directives"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="hidden md:inline">Security Posture</span>
          </button>

          {user && (
            <button
              id="sign-out-btn"
              type="button"
              onClick={onRequestSignOut}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-300"
              title="Sign out of ThoughtKeep"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
