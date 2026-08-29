/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * THE LEDGER (screen) — this user's own security audit trail.
 * Read-only by construction: there is no control here that writes, and the
 * published Firestore rules deny client writes to securityEvents outright.
 */

import React, { useEffect, useState } from 'react';
import { getFreshIdToken } from '../firebase.ts';

interface LedgerEntry {
  eventId: string;
  timestamp: string;
  action: string;
  decision: 'ALLOWED' | 'BLOCKED' | 'REDACTED';
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

const SEVERITY_STYLE: Record<string, string> = {
  HIGH: 'bg-rose-100 text-rose-700 ring-rose-200',
  MEDIUM: 'bg-amber-100 text-amber-700 ring-amber-200',
  LOW: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const DECISION_STYLE: Record<string, string> = {
  BLOCKED: 'text-rose-700',
  REDACTED: 'text-amber-700',
  ALLOWED: 'text-emerald-700',
};

export function SecurityScreen() {
  const [events, setEvents] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getFreshIdToken();
        if (!token) throw new Error('no-token');
        const res = await fetch('/api/security/events', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('request-failed');
        const json = await res.json();
        if (!cancelled) setEvents(Array.isArray(json.events) ? json.events : []);
      } catch {
        if (!cancelled) setError('We could not load your security events right now. Please try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const assurances = [
    ['Identity verified', 'Every request carries a Google ID token that the server verifies before anything else happens.'],
    ['Data isolated', 'Your entries live under your own user ID, and the database itself refuses access to anyone else.'],
    ['Secrets protected', 'The AI key is held server-side in Secret Manager and never reaches your browser.'],
    ['The Gate active', 'Messages are screened by Google Cloud Model Armor in both directions before the AI sees or answers them.'],
  ];

  return (
    <div className="flex-1 px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="font-serif text-2xl font-semibold text-slate-900">Security</h1>
        <p className="mt-1 text-sm text-slate-500">
          A record of every decision ThoughtKeep made about your messages. It stores what was
          decided, never what you wrote.
        </p>
      </header>

      <section className="mb-8 grid gap-3 sm:grid-cols-2">
        {assurances.map(([title, detail]) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">✓</span>
              <span className="text-sm font-semibold text-slate-900">{title}</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{detail}</p>
          </div>
        ))}
      </section>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Event history
      </h2>

      {loading && <p className="text-sm text-slate-500">Loading your events…</p>}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            No security events yet. They appear here whenever ThoughtKeep screens a message.
          </p>
        </div>
      )}

      {events.length > 0 && (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.eventId} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${SEVERITY_STYLE[e.severity] ?? SEVERITY_STYLE.LOW}`}>
                  {e.severity}
                </span>
                <code className="font-mono text-xs text-slate-500">{e.eventId}</code>
                <span className="text-sm font-medium text-slate-900">
                  {e.action.replace(/_/g, ' ').toLowerCase()}
                </span>
                <span className={`text-xs font-semibold ${DECISION_STYLE[e.decision] ?? ''}`}>
                  {e.decision}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                <span>Category: {e.category}</span>
                <span>{e.timestamp ? new Date(e.timestamp).toLocaleString() : ''}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-slate-400">
        This log is written only by ThoughtKeep's server and cannot be edited from your browser —
        an audit trail its own subject could change would not be evidence of anything.
      </p>
    </div>
  );
}
