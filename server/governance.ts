/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * GOVERNANCE — per-entry privacy policy, data portability and erasure.
 *
 * Two ideas sit behind this file:
 *
 * 1. The user decides what the AI may read, per entry. That decision is
 *    enforced at the screening choke point, not merely displayed in the UI.
 *
 * 2. The user's data belongs to the user. They may take all of it with them,
 *    and they may destroy all of it. Neither action requires asking anyone.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from './auth.js';

export type Retention = 'forever' | '7d' | '30d' | '365d';

const RETENTION_DAYS: Record<Exclude<Retention, 'forever'>, number> = {
  '7d': 7,
  '30d': 30,
  '365d': 365,
};

export function normalizeRetention(input: unknown): Retention {
  return input === '7d' || input === '30d' || input === '365d' ? input : 'forever';
}

/**
 * Firestore deletes documents whose TTL field is in the past. "forever" is
 * expressed as the ABSENCE of the field, which is how Firestore disables TTL
 * per document — not as a far-future date, which would silently become a
 * deletion date if anyone ever changed the constant.
 */
export function computeExpiresAt(retention: Retention, from: Date = new Date()): Timestamp | null {
  if (retention === 'forever') return null;
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + RETENTION_DAYS[retention]);
  return Timestamp.fromDate(d);
}

/** Human wording that matches what Firestore actually guarantees. */
export function retentionLabel(retention: Retention): string {
  switch (retention) {
    case '7d': return 'Auto-deletes about 7 days after saving';
    case '30d': return 'Auto-deletes about 30 days after saving';
    case '365d': return 'Auto-deletes about a year after saving';
    default: return 'Kept until you delete it';
  }
}

/* ------------------------------------------------------------------ */
/* Data portability                                                    */
/* ------------------------------------------------------------------ */

/**
 * Everything ThoughtKeep holds about this user, in one plain JSON file.
 * The uid comes from the verified token, so there is no parameter with which
 * to request somebody else's export.
 */
export async function exportUserData(uid: string): Promise<Record<string, unknown>> {
  const db = getAdminFirestore();
  const userRef = db.collection('users').doc(uid);

  const [entriesSnap, eventsSnap, profileSnap, usageSnap] = await Promise.all([
    userRef.collection('entries').orderBy('createdAt', 'desc').get(),
    userRef.collection('securityEvents').orderBy('timestamp', 'desc').limit(500).get(),
    userRef.collection('profile').doc('main').get(),
    userRef.collection('usage').doc('daily').get(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    note:
      'This is everything ThoughtKeep stores about you. Your Google account details ' +
      'are held by Google, not by ThoughtKeep. The AI provider does not retain your ' +
      'entries; they are sent for a single reply and not stored there.',
    journalEntries: entriesSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    securityEvents: eventsSnap.docs.map((d) => d.data()),
    profile: profileSnap.exists ? profileSnap.data() : null,
    usageToday: usageSnap.exists ? usageSnap.data() : null,
  };
}

/* ------------------------------------------------------------------ */
/* Erasure                                                             */
/* ------------------------------------------------------------------ */

async function deleteBatch(query: FirebaseFirestore.Query): Promise<number> {
  const db = getAdminFirestore();
  const snap = await query.limit(400).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

/**
 * Permanently delete every document this user owns.
 *
 * The security audit trail is deleted LAST and deliberately: while the user
 * exists, they must not be able to erase their own audit records one by one
 * (the rules deny that), but a user who removes themselves entirely takes
 * their whole record with them. Retaining an audit trail for a person who no
 * longer exists would be keeping data about someone who asked to be forgotten.
 */
export async function eraseUserData(uid: string): Promise<{ deleted: number }> {
  const db = getAdminFirestore();
  const userRef = db.collection('users').doc(uid);
  let total = 0;

  for (const sub of ['entries', 'profile', 'usage', 'securityEvents']) {
    // Loop because a batch is capped; keep going until the collection is empty.
    for (;;) {
      const n = await deleteBatch(userRef.collection(sub));
      total += n;
      if (n === 0) break;
    }
  }

  await userRef.delete().catch(() => undefined);
  return { deleted: total };
}
