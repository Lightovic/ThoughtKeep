/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * QUOTAS AND METRICS
 *
 * Two independent daily limits, both counted on the IST calendar day:
 *   1. PER USER   — protects against one account consuming everything.
 *   2. APP-WIDE   — protects the project's budget when the link is public.
 *
 * The same counters feed The Watchtower. Everything written here is a NUMBER
 * or a CATEGORY. No journal text, no message content, no email, no display
 * name — nothing that could turn the metrics store into a second copy of
 * people's private writing (directive 9).
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from './auth.js';

/** Owner is exempt from both limits. Unset => nobody is owner (fails closed). */
const OWNER_UID = process.env.OWNER_UID || '';

const DEFAULT_PER_USER_DAILY = 200;
const DEFAULT_APP_WIDE_DAILY = 2000;

/**
 * The IST calendar day, as YYYY-MM-DD.
 * Quotas reset at midnight India time regardless of where the server runs or
 * where the user is, so "resets at midnight IST" in the UI is literally true.
 */
export function istDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export interface QuotaLimits {
  perUserDaily: number;
  appWideDaily: number;
}

/** Limits live in admin/config so they can change without a redeploy. */
export async function readLimits(): Promise<QuotaLimits> {
  try {
    const snap = await getAdminFirestore().collection('admin').doc('config').get();
    const d = snap.exists ? snap.data() ?? {} : {};
    const n = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
    return {
      perUserDaily: n(d.perUserDailyLimit, DEFAULT_PER_USER_DAILY),
      appWideDaily: n(d.appWideDailyLimit, DEFAULT_APP_WIDE_DAILY),
    };
  } catch {
    return { perUserDaily: DEFAULT_PER_USER_DAILY, appWideDaily: DEFAULT_APP_WIDE_DAILY };
  }
}

export type QuotaDecision =
  | { allowed: true; reason: null }
  | { allowed: false; reason: 'PER_USER_LIMIT' | 'APP_WIDE_LIMIT' };

export class QuotaExceededError extends Error {
  readonly scope: 'PER_USER_LIMIT' | 'APP_WIDE_LIMIT';
  constructor(scope: 'PER_USER_LIMIT' | 'APP_WIDE_LIMIT') {
    super(scope);
    this.name = 'QuotaExceededError';
    this.scope = scope;
  }
}

/**
 * Check both limits BEFORE calling Gemini.
 *
 * Note the deliberate asymmetry with the security controls: if the quota
 * store is unreachable we ALLOW the request. A quota is a cost control, not a
 * security boundary, and failing closed here would take the whole app down
 * over a billing safeguard. Security controls fail closed; this does not.
 * That distinction is recorded in docs/trade-offs.md.
 */
export async function checkQuota(uid: string, reviewerBypass = false): Promise<QuotaDecision> {
  if (OWNER_UID && uid === OWNER_UID) return { allowed: true, reason: null };

  const db = getAdminFirestore();
  const day = istDateKey();
  const limits = await readLimits();

  try {
    const [userSnap, metricsSnap] = await Promise.all([
      db.collection('users').doc(uid).collection('usage').doc('daily').get(),
      db.collection('admin').doc('metrics').get(),
    ]);

    const u = userSnap.exists ? userSnap.data() ?? {} : {};
    const usedByUser = u.dateKey === day && typeof u.messageCount === 'number' ? u.messageCount : 0;
    if (usedByUser >= limits.perUserDaily) {
      return { allowed: false, reason: 'PER_USER_LIMIT' };
    }

    // A valid reviewer code lifts the APP-WIDE ceiling only. The per-user
    // limit above still applies, so the code can never be used to drain the
    // budget from a single account. It is a cost control, never a data
    // boundary — it grants access to nothing.
    if (!reviewerBypass) {
      const m = metricsSnap.exists ? metricsSnap.data() ?? {} : {};
      const usedToday = m.dateKey === day && typeof m.messageCount === 'number' ? m.messageCount : 0;
      if (usedToday >= limits.appWideDaily) {
        return { allowed: false, reason: 'APP_WIDE_LIMIT' };
      }
    }

    return { allowed: true, reason: null };
  } catch {
    return { allowed: true, reason: null };
  }
}

/** Rough token estimate. Labelled "estimated" everywhere it is shown. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || '').length / 4));
}

/**
 * Record one processed message against both counters, plus the 14-day series
 * The Watchtower charts. Never throws: a metrics failure must not break a
 * reflection.
 */
export async function recordUsage(uid: string, tokens: number): Promise<void> {
  const db = getAdminFirestore();
  const day = istDateKey();

  try {
    const userRef = db.collection('users').doc(uid).collection('usage').doc('daily');
    const metricsRef = db.collection('admin').doc('metrics');
    const dailyRef = metricsRef.collection('daily').doc(day);

    let isNewUserToday = false;

    await db.runTransaction(async (tx) => {
      const [uSnap, mSnap] = await Promise.all([tx.get(userRef), tx.get(metricsRef)]);
      const u = uSnap.exists ? uSnap.data() ?? {} : {};
      const m = mSnap.exists ? mSnap.data() ?? {} : {};

      // Roll the user's counter over at the IST boundary.
      const userRollover = u.dateKey !== day;
      isNewUserToday = userRollover;
      tx.set(userRef, {
        dateKey: day,
        messageCount: userRollover ? 1 : (u.messageCount ?? 0) + 1,
        tokenEstimate: userRollover ? tokens : (u.tokenEstimate ?? 0) + tokens,
        updatedAt: new Date().toISOString(),
      });

      const appRollover = m.dateKey !== day;
      tx.set(
        metricsRef,
        {
          dateKey: day,
          messageCount: appRollover ? 1 : (m.messageCount ?? 0) + 1,
          tokenEstimate: appRollover ? tokens : (m.tokenEstimate ?? 0) + tokens,
          activeUsersToday: appRollover ? 1 : (m.activeUsersToday ?? 0) + (isNewUserToday ? 1 : 0),
          allTimeMessages: (m.allTimeMessages ?? 0) + 1,
          allTimeTokens: (m.allTimeTokens ?? 0) + tokens,
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
    });

    await dailyRef.set(
      { dateKey: day, messageCount: FieldValue.increment(1), tokenEstimate: FieldValue.increment(tokens) },
      { merge: true },
    );
  } catch {
    /* metrics are best-effort by design */
  }
}

/** Count a Gate block, by category, for The Watchtower's threat panel. */
export async function recordBlock(category: string): Promise<void> {
  try {
    const safe = String(category || 'unspecified').replace(/[^a-z ]/gi, '').slice(0, 40) || 'unspecified';
    await getAdminFirestore()
      .collection('admin')
      .doc('metrics')
      .set(
        {
          allTimeBlocked: FieldValue.increment(1),
          blockedByCategory: { [safe]: FieldValue.increment(1) },
        },
        { merge: true },
      );
  } catch {
    /* best effort */
  }
}
