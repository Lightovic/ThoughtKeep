/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * THE WATCHTOWER — owner-only operational view.
 *
 * THE ABSOLUTE RULE OF THIS FILE:
 * It reads admin/metrics and admin/metrics/daily. Nothing else. It must never
 * read, search, export or expose any user's journal entries, conversation
 * text, message content, summaries, email addresses, display names or profile
 * details. There is no code path here that touches the users/ collection, and
 * that absence is the control.
 *
 * The owner administers the system. The owner does not read its users'
 * journals. That is not a policy written in a document that code may quietly
 * contradict — it is enforced by this file containing no query that could.
 */

import { getAdminFirestore } from './auth.js';
import { istDateKey, readLimits } from './quota.js';

/**
 * Unset OWNER_UID means nobody is the owner. Fails closed: an unconfigured
 * deployment exposes the Watchtower to no one rather than to everyone.
 */
const OWNER_UID = process.env.OWNER_UID || '';

export function isOwner(uid: string): boolean {
  return OWNER_UID.length > 0 && uid === OWNER_UID;
}

export interface WatchtowerMetrics {
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

/**
 * Rough cost estimate, deliberately labelled an estimate in the UI.
 * Based on a Flash-class blended rate; it is an order-of-magnitude guide for
 * the owner, never a billing figure. The authoritative number is Cloud Billing.
 */
const USD_PER_1K_TOKENS = 0.0003;

export async function readWatchtowerMetrics(): Promise<WatchtowerMetrics> {
  const db = getAdminFirestore();
  const day = istDateKey();
  const limits = await readLimits();

  const metricsRef = db.collection('admin').doc('metrics');
  const [snap, dailySnap] = await Promise.all([
    metricsRef.get(),
    metricsRef.collection('daily').orderBy('dateKey', 'desc').limit(14).get(),
  ]);

  const m = snap.exists ? snap.data() ?? {} : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  // Only counters that belong to today are reported as today's.
  const isToday = m.dateKey === day;

  const rawCats = (m.blockedByCategory ?? {}) as Record<string, unknown>;
  const blockedByCategory: Record<string, number> = {};
  for (const [k, v] of Object.entries(rawCats)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      blockedByCategory[String(k).slice(0, 40)] = v;
    }
  }

  const dailySeries = dailySnap.docs
    .map((d) => {
      const x = d.data() ?? {};
      return { date: String(x.dateKey ?? d.id), messages: num(x.messageCount) };
    })
    .reverse();

  const tokensAllTime = num(m.allTimeTokens);

  return {
    dateKey: day,
    messagesToday: isToday ? num(m.messageCount) : 0,
    messagesAllTime: num(m.allTimeMessages),
    tokensToday: isToday ? num(m.tokenEstimate) : 0,
    tokensAllTime,
    activeUsersToday: isToday ? num(m.activeUsersToday) : 0,
    blockedAllTime: num(m.allTimeBlocked),
    blockedByCategory,
    appWideLimit: limits.appWideDaily,
    perUserLimit: limits.perUserDaily,
    estimatedSpendUsd: Math.round((tokensAllTime / 1000) * USD_PER_1K_TOKENS * 10000) / 10000,
    dailySeries,
  };
}

/** Update the limits. Owner-only; the caller checks that first. */
export async function updateLimits(perUser: unknown, appWide: unknown): Promise<void> {
  const clean = (v: unknown, lo: number, hi: number): number | null => {
    const n = typeof v === 'number' ? Math.floor(v) : NaN;
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  };
  const p = clean(perUser, 1, 10000);
  const a = clean(appWide, 1, 100000);

  const patch: Record<string, number> = {};
  if (p !== null) patch.perUserDailyLimit = p;
  if (a !== null) patch.appWideDailyLimit = a;
  if (Object.keys(patch).length === 0) return;

  await getAdminFirestore().collection('admin').doc('config').set(patch, { merge: true });
}
