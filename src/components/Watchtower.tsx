/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * THE WATCHTOWER (screen) — owner-only operational view.
 * Renders aggregate counters only. There is no journal text on this screen
 * because the server endpoint that feeds it cannot read any.
 */

import React, { useEffect, useState } from 'react';
import { getFreshIdToken } from '../firebase.ts';

interface Metrics {
  dateKey: string;
  messagesToday: number;
  messagesAllTime: number;
  tokensToday: number;
  tokensAllTime: number;
  activeUsersToday: number;
  blockedAllTime: number;
  blockedByCategory: Record<string, number>;
  appWideLimit: number;
  perUserLimit: number;
  estimatedSpendUsd: number;
  dailySeries: Array<{ date: string; messages: number }>;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 font-serif text-2xl font-semibold text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function Watchtower() {
  const [m, setM] = useState<Metrics | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getFreshIdToken();
        if (!token) throw new Error('no-token');
        const res = await fetch('/api/watchtower', { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 404) { if (!cancelled) setState('notfound'); return; }
        if (!res.ok) throw new Error('failed');
        const json = await res.json();
        if (!cancelled) { setM(json); setState('ready'); }
      } catch {
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // A non-owner sees exactly what they would see for any address that does
  // not exist. No hint that this page is real.
  if (state === 'notfound') {
    return (
      <div className="flex-1 px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-semibold text-slate-900">Not found</h1>
        <p className="mt-2 text-sm text-slate-500">That page does not exist.</p>
      </div>
    );
  }
  if (state === 'loading') return <div className="flex-1 px-4 py-10 text-sm text-slate-500">Loading…</div>;
  if (state === 'error' || !m) {
    return <div className="flex-1 px-4 py-10 text-sm text-rose-700">Unable to load metrics right now.</div>;
  }

  const pct = m.appWideLimit > 0 ? Math.min(100, Math.round((m.messagesToday / m.appWideLimit) * 100)) : 0;
  const peak = Math.max(1, ...m.dailySeries.map((d) => d.messages));
  const cats: Array<[string, number]> = Object.entries(m.blockedByCategory)
    .map(([k, v]) => [k, Number(v) || 0] as [string, number])
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex-1 px-4 py-6 sm:px-6">
      <header className="mb-2">
        <h1 className="font-serif text-2xl font-semibold text-slate-900">The Watchtower</h1>
        <p className="mt-1 text-sm text-slate-500">Operational metrics for {m.dateKey} (IST).</p>
      </header>

      <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-medium text-emerald-900">
          Aggregate metrics only. ThoughtKeep's owner cannot read any user's journal.
        </p>
        <p className="mt-1 text-xs leading-relaxed text-emerald-800">
          This page is fed by a server endpoint that reads counters and nothing else. It contains no
          query capable of reaching any user's entries, conversations or profile — the guarantee is
          the absence of the code, not a promise about it.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Messages today" value={String(m.messagesToday)} hint={`of ${m.appWideLimit} daily ceiling`} />
        <Stat label="Messages all time" value={String(m.messagesAllTime)} />
        <Stat label="Active users today" value={String(m.activeUsersToday)} />
        <Stat label="Threats blocked" value={String(m.blockedAllTime)} hint="all time, by The Gate" />
        <Stat label="Tokens today" value={m.tokensToday.toLocaleString()} hint="estimated" />
        <Stat label="Tokens all time" value={m.tokensAllTime.toLocaleString()} hint="estimated" />
        <Stat label="Estimated spend" value={`$${m.estimatedSpendUsd.toFixed(4)}`} hint="rough guide only — Cloud Billing is authoritative" />
        <Stat label="Per-user limit" value={String(m.perUserLimit)} hint="messages per day" />
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Daily capacity</h2>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${pct > 85 ? 'bg-rose-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-slate-500">{m.messagesToday} of {m.appWideLimit} used today ({pct}%)</p>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Messages, last 14 days</h2>
        {m.dailySeries.length === 0 ? (
          <p className="text-xs text-slate-400">No data yet.</p>
        ) : (
          <div className="flex h-32 items-end gap-1.5">
            {m.dailySeries.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-slate-800"
                  style={{ height: `${Math.max(3, (d.messages / peak) * 100)}%` }}
                  title={`${d.date}: ${d.messages}`}
                />
                <span className="text-[9px] text-slate-400">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Threats blocked by category</h2>
        {cats.length === 0 ? (
          <p className="text-xs text-slate-400">Nothing blocked yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {cats.map(([c, n]) => (
              <li key={c} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{c}</span>
                <span className="font-semibold text-slate-900">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
