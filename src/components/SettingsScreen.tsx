/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SETTINGS — the Companion role, per-entry governance, and the two rights
 * that make "your data is yours" mean something: take it, or destroy it.
 */

import React, { useEffect, useState } from 'react';
import { getFreshIdToken } from '../firebase.ts';
import type { JournalEntry } from '../types.ts';

interface Props {
  entries: JournalEntry[];
  onEntryDeleted: (id: string) => void;
  onEntriesChanged: () => void;
}

const ROLE_EXAMPLES = ['student', 'teacher', 'software engineer', 'bus driver', 'nurse', 'business owner', 'retired'];

const RETENTION_OPTIONS = [
  { value: '7d', label: 'About 7 days' },
  { value: '30d', label: 'About 30 days' },
  { value: '365d', label: 'About 1 year' },
  { value: 'forever', label: 'Keep until I delete it' },
] as const;

export function SettingsScreen({ entries, onEntryDeleted, onEntriesChanged }: Props) {
  const [role, setRole] = useState('');
  const [savedRole, setSavedRole] = useState<string | null>(null);
  const [roleStatus, setRoleStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmErase, setConfirmErase] = useState('');
  const [eraseStatus, setEraseStatus] = useState<string | null>(null);
  const [retention, setRetention] = useState(() => {
    try {
      return localStorage.getItem('thoughtkeep-retention') || '30d';
    } catch {
      return '30d';
    }
  });

  useEffect(() => {
    (async () => {
      try {
        const token = await getFreshIdToken();
        if (!token) return;
        const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const j = await res.json();
        setSavedRole(j.role ?? null);
        setRole(j.role ?? '');
      } catch { /* settings still usable */ }
    })();
  }, []);

  const saveRole = async () => {
    setBusy(true); setRoleStatus(null);
    try {
      const token = await getFreshIdToken();
      if (!token) throw new Error('no-token');
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error('failed');
      const j = await res.json();
      setSavedRole(j.role ?? null);
      setRoleStatus(
        j.role
          ? 'Saved. ThoughtKeep will match its tone to that.'
          : 'Cleared. ThoughtKeep will keep a neutral tone. (Descriptions that read like instructions are not stored.)',
      );
    } catch {
      setRoleStatus('Could not save that right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const token = await getFreshIdToken();
      if (!token) throw new Error('no-token');
      const res = await fetch('/api/export', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `thoughtkeep-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setRoleStatus('Could not prepare your export right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const eraseEverything = async () => {
    setBusy(true); setEraseStatus(null);
    try {
      const token = await getFreshIdToken();
      if (!token) throw new Error('no-token');
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('failed');
      setEraseStatus('Everything has been deleted. Signing you out.');
      setTimeout(() => { window.location.href = '/'; }, 1500);
    } catch {
      setEraseStatus('Could not complete that right now. Nothing was deleted.');
    } finally {
      setBusy(false);
    }
  };

  const locked = entries.filter((e) => e.aiProcessing === 'never');

  return (
    <div className="flex-1 px-4 py-6 sm:px-6">
      <h1 className="font-serif text-2xl font-semibold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Your companion, your entries, and your data.</p>

      {/* ---------- Companion ---------- */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">What best describes your day-to-day?</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Optional. It changes how ThoughtKeep talks to you — nothing else.
          It does not unlock anything, and it never changes what you can see.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ROLE_EXAMPLES.map((r) => (
            <button key={r} type="button" onClick={() => setRole(r)}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100">
              {r}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={60}
            placeholder="for example: nurse"
            aria-label="Describe your day-to-day"
            className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          />
          <button type="button" onClick={saveRole} disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Save
          </button>
          <button type="button" onClick={() => { setRole(''); }} disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700">
            Skip
          </button>
        </div>
        {savedRole && <p className="mt-2 text-xs text-slate-500">Currently: <strong>{savedRole}</strong></p>}
        {roleStatus && <p role="status" className="mt-2 text-xs text-slate-600">{roleStatus}</p>}
      </section>

      {/* ---------- Voice & Conversation ---------- */}
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Voice & Conversation
        </h2>

        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Choose how ThoughtKeep speaks with you. These preferences are stored
          on this device and do not change your journal permissions or data access.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="settings-voice-replies"
              className="block text-xs font-medium text-slate-700"
            >
              Voice replies
            </label>

            <button
              id="settings-voice-replies"
              type="button"
              aria-pressed={
                (() => {
                  try {
                    return localStorage.getItem('thoughtkeep-voice-replies') === 'true';
                  } catch {
                    return false;
                  }
                })()
              }
              onClick={() => {
                try {
                  const current =
                    localStorage.getItem('thoughtkeep-voice-replies') === 'true';

                  localStorage.setItem(
                    'thoughtkeep-voice-replies',
                    String(!current),
                  );

                  window.dispatchEvent(new Event('thoughtkeep-voice-settings-changed'));
                } catch {
                  // Settings remain usable for this session.
                }

                setRoleStatus(null);
              }}
              className={`mt-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                (() => {
                  try {
                    return localStorage.getItem('thoughtkeep-voice-replies') === 'true';
                  } catch {
                    return false;
                  }
                })()
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {(() => {
                try {
                  return localStorage.getItem('thoughtkeep-voice-replies') === 'true'
                    ? 'On'
                    : 'Off';
                } catch {
                  return 'Off';
                }
              })()}
            </button>
          </div>

          <div>
            <label
              htmlFor="settings-voice-style"
              className="block text-xs font-medium text-slate-700"
            >
              Voice
            </label>

            <select
              id="settings-voice-style"
              defaultValue={(() => {
                try {
                  return localStorage.getItem('thoughtkeep-voice-style') === 'girl'
                    ? 'girl'
                    : 'boy';
                } catch {
                  return 'boy';
                }
              })()}
              onChange={(e) => {
                try {
                  localStorage.setItem(
                    'thoughtkeep-voice-style',
                    e.target.value,
                  );

                  window.dispatchEvent(new Event('thoughtkeep-voice-settings-changed'));
                } catch {
                  // Settings remain usable for this session.
                }
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <option value="girl">👩 Girl voice</option>
              <option value="boy">👨 Boy voice</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="settings-dictation-language"
              className="block text-xs font-medium text-slate-700"
            >
              Dictation language
            </label>

            <select
              id="settings-dictation-language"
              defaultValue={(() => {
                try {
                  return localStorage.getItem('thoughtkeep-dictation-language') || 'auto';
                } catch {
                  return 'auto';
                }
              })()}
              onChange={(e) => {
                try {
                  localStorage.setItem(
                    'thoughtkeep-dictation-language',
                    e.target.value,
                  );

                  window.dispatchEvent(new Event('thoughtkeep-voice-settings-changed'));
                } catch {
                  // Settings remain usable for this session.
                }
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <option value="auto">Auto-detect</option>
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">हिन्दी Hindi</option>
              <option value="gu-IN">ગુજરાતી Gujarati</option>
              <option value="mr-IN">मराठी Marathi</option>
              <option value="bn-IN">বাংলা Bengali</option>
              <option value="ta-IN">தமிழ் Tamil</option>
              <option value="te-IN">తెలుగు Telugu</option>
              <option value="kn-IN">ಕನ್ನಡ Kannada</option>
              <option value="ml-IN">മലയാളം Malayalam</option>
              <option value="pa-IN">ਪੰਜਾਬੀ Punjabi</option>
              <option value="ur-IN">اردو Urdu</option>
            </select>

            <p className="mt-1.5 text-[11px] text-slate-400">
              This controls the language used when you dictate into the Journal.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Privacy & Data ---------- */}
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">
          Privacy & Data
        </h2>

        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Choose how long newly saved entries should remain in ThoughtKeep.
          This setting does not change existing entries.
        </p>

        <div className="mt-4">
          <label
            htmlFor="settings-retention"
            className="block text-xs font-medium text-slate-700"
          >
            Keep new entries for
          </label>

          <select
            id="settings-retention"
            value={retention}
            onChange={(e) => {
              const value = e.target.value;

              setRetention(value);

              try {
                localStorage.setItem('thoughtkeep-retention', value);
                window.dispatchEvent(
                  new Event('thoughtkeep-retention-changed'),
                );
              } catch {
                // Keep the in-memory setting for this session.
              }
            }}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 sm:max-w-md"
          >
            {RETENTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <p className="mt-2 text-[11px] text-slate-400">
            Firestore automatically removes entries after their selected
            expiry period. “Forever” means there is no automatic expiry.
          </p>
        </div>
      </section>

      {/* ---------- Governance ---------- */}
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Your entries and their policies</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Each entry carries its own policy. An entry marked “Never send to AI” is
          excluded from everything Gemini sees — including summaries — not merely hidden.
        </p>

        {locked.length > 0 && (
          <p className="mt-2 text-xs text-slate-600">
            {locked.length} {locked.length === 1 ? 'entry is' : 'entries are'} withheld from the AI.
          </p>
        )}

        {entries.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">No entries saved yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {e.aiProcessing === 'never' && (
                      <svg aria-label="Withheld from AI" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-slate-500"
                           fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
                      </svg>
                    )}
                    <span className="truncate text-sm text-slate-800">{e.title}</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(e.createdAt).toLocaleDateString()}
                    {e.aiProcessing === 'never' ? ' · never sent to AI' : ' · AI may read'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm('Permanently delete this entry? This cannot be undone.')) return;
                    try {
                      const token = await getFreshIdToken();
                      if (!token) return;
                      const res = await fetch(`/api/entries/${encodeURIComponent(e.id)}`, {
                        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
                      });
                      if (res.ok) { onEntryDeleted(e.id); onEntriesChanged(); }
                    } catch { /* surfaced by the list not changing */ }
                  }}
                  className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Portability ---------- */}
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Take your data with you</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Download everything ThoughtKeep holds about you as a plain JSON file — entries,
          security events, and your profile. No request, no waiting.
        </p>
        <button type="button" onClick={exportData} disabled={busy}
          className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50">
          Download my data
        </button>
      </section>

      {/* ---------- Erasure ---------- */}
      <section className="mt-4 rounded-xl border border-rose-200 bg-rose-50/40 p-5">
        <h2 className="text-sm font-semibold text-rose-900">Delete everything</h2>
        <p className="mt-1 text-xs leading-relaxed text-rose-800">
          Permanently deletes every entry, your security history and your profile.
          This cannot be undone, and ThoughtKeep keeps no copy afterwards.
        </p>
        <label className="mt-3 block text-xs font-medium text-rose-900" htmlFor="erase-confirm">
          Type DELETE to confirm
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            id="erase-confirm"
            value={confirmErase}
            onChange={(e) => setConfirmErase(e.target.value)}
            className="rounded-lg border border-rose-300 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
          />
          <button
            type="button"
            disabled={confirmErase !== 'DELETE' || busy}
            onClick={eraseEverything}
            className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Delete everything
          </button>
        </div>
        {eraseStatus && <p role="status" className="mt-2 text-xs font-medium text-rose-900">{eraseStatus}</p>}
      </section>
    </div>
  );
}
