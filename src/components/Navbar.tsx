/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, PenLine, LogOut, ShieldCheck, CheckCircle2, Settings, Menu, X } from 'lucide-react';
import type { UserProfile } from '../types.ts';

interface NavbarProps {
  user: UserProfile | null;
  activeView: 'journal' | 'history' | 'security' | 'watchtower' | 'settings';
  historyCount: number;
  onNavigate: (view: 'journal' | 'history' | 'security' | 'watchtower' | 'settings') => void;
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
  const [isUserPopoverOpen, setIsUserPopoverOpen] = useState(false);
  const [isAvatarHovered, setIsAvatarHovered] = useState(false);
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const popoverRef = useRef<HTMLDivElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);

  // Close popover on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        userButtonRef.current &&
        !userButtonRef.current.contains(event.target as Node)
      ) {
        setIsUserPopoverOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isUserPopoverOpen) {
        setIsUserPopoverOpen(false);
        userButtonRef.current?.focus();
      }
    };

    if (isUserPopoverOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isUserPopoverOpen]);

  const handleBrandClick = () => {
    if (activeView !== 'journal') {
      onNavigate('journal');
    }
  };

  return (
    <header
      id="main-navbar"
      className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Interactive Brand and Logo (Issue 5) */}
        <div className="relative">
          <button
            id="navbar-brand-btn"
            type="button"
            onClick={handleBrandClick}
            onMouseEnter={() => setIsLogoHovered(true)}
            onMouseLeave={() => setIsLogoHovered(false)}
            onFocus={() => setIsLogoHovered(true)}
            onBlur={() => setIsLogoHovered(false)}
            className="flex items-center gap-3 rounded-xl p-1 text-left transition-colors hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-slate-300"
            aria-label="ThoughtKeep — Private AI Journal"
          >
            <div
              id="tk-monogram-logo"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 font-serif text-sm font-semibold tracking-wider text-slate-50 shadow-xs ring-1 ring-slate-900/10"
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
          </button>

          {/* Logo Hover Tooltip */}
          {isLogoHovered && (
            <div
              id="brand-tooltip"
              role="tooltip"
              className="pointer-events-none absolute top-full left-0 mt-1.5 z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-medium text-white shadow-lg animate-in fade-in duration-150"
            >
              ThoughtKeep — Private AI Journal
            </div>
          )}
        </div>

        {/* Center: Navigation Controls (Only if signed in) */}
        {user && (
          <nav id="navbar-view-navigation" className="hidden items-center gap-1 sm:flex sm:gap-2">
            <button
              id="nav-journal-tab-btn"
              type="button"
              onClick={() => onNavigate('journal')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all focus:outline-hidden focus:ring-2 focus:ring-slate-300 ${
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
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all focus:outline-hidden focus:ring-2 focus:ring-slate-300 ${
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
            <button
              id="nav-security-tab-btn"
              type="button"
              onClick={() => onNavigate('security')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all focus:outline-hidden focus:ring-2 focus:ring-slate-300 ${
                activeView === 'security'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              <span>Security</span>
            </button>
          </nav>
        )}

        {/* Mobile menu trigger */}
        {user && (
          <button
            id="navbar-mobile-menu-btn"
            type="button"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={isMobileMenuOpen}
            className="inline-flex items-center justify-center rounded-xl p-2 text-slate-600 hover:bg-slate-100 focus:outline-hidden focus:ring-2 focus:ring-slate-300 sm:hidden"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        )}

        {/* Right: Security Posture & Interactive User Menu (Issue 4) */}
        <div className="hidden items-center gap-2 sm:flex sm:gap-3">
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
            <div className="relative border-l border-slate-200 pl-2 sm:pl-3">
              {/* Interactive User Trigger Button */}
              <button
                ref={userButtonRef}
                id="navbar-user-identity-btn"
                type="button"
                aria-haspopup="dialog"
                aria-expanded={isUserPopoverOpen}
                aria-label="User account details"
                onClick={() => {
                  setIsUserPopoverOpen(!isUserPopoverOpen);
                  setIsAvatarHovered(false);
                }}
                onMouseEnter={() => {
                  if (!isUserPopoverOpen) setIsAvatarHovered(true);
                }}
                onMouseLeave={() => setIsAvatarHovered(false)}
                onFocus={() => {
                  if (!isUserPopoverOpen) setIsAvatarHovered(true);
                }}
                onBlur={() => setIsAvatarHovered(false)}
                className="flex items-center gap-2 rounded-full p-0.5 text-left transition-all hover:ring-2 hover:ring-slate-300 focus:outline-hidden focus:ring-2 focus:ring-slate-400"
              >
                {user.photoURL ? (
                  <img
                    id="navbar-user-avatar"
                    src={user.photoURL}
                    alt={user.displayName || user.email || 'User profile'}
                    className="h-7 w-7 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    id="navbar-user-avatar-fallback"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 font-sans text-xs font-medium text-slate-700 ring-1 ring-slate-200 shrink-0"
                  >
                    {(user.displayName?.[0] || user.email?.[0] || 'U').toUpperCase()}
                  </div>
                )}
                <span
                  id="navbar-user-name"
                  className="hidden sm:inline-block max-w-[130px] truncate text-xs font-medium text-slate-700"
                >
                  {user.displayName || user.email}
                </span>
              </button>

              {/* Hover Tooltip (Issue 5) - Never exposes UID */}
              {isAvatarHovered && !isUserPopoverOpen && (
                <div
                  id="user-hover-tooltip"
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-full mt-1.5 z-50 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1 text-xs text-white shadow-lg animate-in fade-in duration-150"
                >
                  <span className="font-medium">Signed in with Google</span>
                </div>
              )}

              {/* Click Popover (Issue 4) - Accessible, compact, no UID */}
              {isUserPopoverOpen && (
                <div
                  ref={popoverRef}
                  id="navbar-user-popover"
                  role="dialog"
                  aria-modal="false"
                  aria-label="User Profile"
                  className="absolute right-0 top-full mt-2 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 font-sans text-sm font-semibold text-slate-700 ring-1 ring-slate-200 shrink-0">
                        {(user.displayName?.[0] || user.email?.[0] || 'U').toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      {user.displayName && (
                        <p className="truncate text-xs font-semibold text-slate-900">
                          {user.displayName}
                        </p>
                      )}
                      {user.email && (
                        <p className="truncate text-[11px] text-slate-500">
                          {user.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span className="font-medium text-[11px]">Signed in with Google</span>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100">
                    <button
                      id="popover-settings-btn"
                      type="button"
                      onClick={() => {
                        setIsUserPopoverOpen(false);
                        onNavigate('settings');
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors focus:outline-hidden focus:ring-2 focus:ring-slate-300"
                    >
                      <Settings className="h-3.5 w-3.5" />
                      <span>Settings</span>
                    </button>

                    <button
                      id="popover-sign-out-btn"
                      type="button"
                      onClick={() => {
                        setIsUserPopoverOpen(false);
                        onRequestSignOut();
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 transition-colors focus:outline-hidden focus:ring-2 focus:ring-slate-300"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile navigation menu */}
      {user && isMobileMenuOpen && (
        <div
          id="navbar-mobile-menu"
          className="border-t border-slate-200 bg-white px-4 py-3 shadow-lg sm:hidden"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-1">
            <button
              id="mobile-nav-journal"
              type="button"
              onClick={() => {
                onNavigate('journal');
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <PenLine className="h-4 w-4 shrink-0" />
              <span>Journal</span>
            </button>

            <button
              id="mobile-nav-history"
              type="button"
              onClick={() => {
                onNavigate('history');
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span>History</span>
            </button>

            <button
              id="mobile-nav-security"
              type="button"
              onClick={() => {
                onNavigate('security');
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>Security</span>
            </button>

            <button
              id="mobile-nav-security-posture"
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenSecurity();
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Security Posture</span>
            </button>

            <button
              id="mobile-nav-settings"
              type="button"
              onClick={() => {
                onNavigate('settings');
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span>Settings</span>
            </button>

            <div className="my-1 border-t border-slate-100" />

            <button
              id="mobile-nav-sign-out"
              type="button"
              onClick={() => {
                setIsMobileMenuOpen(false);
                onRequestSignOut();
              }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
