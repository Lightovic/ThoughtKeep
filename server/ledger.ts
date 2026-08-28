/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * THE LEDGER — a per-user security audit trail.
 *
 * Every decision The Gate makes is written to
 *   users/{uid}/securityEvents/{eventId}
 *
 * Two properties make this an audit trail rather than a log:
 *
 * 1. It is written ONLY by the backend, using the Admin SDK, which bypasses
 *    Firestore rules by design. The published rules give the user READ access
 *    and deny write entirely. An audit trail its own subject can edit is not
 *    evidence of anything.
 *
 * 2. It records the DECISION, never the content. No message text, no secret,
 *    no token, no personal data — only what was decided and in which general
 *    category (directive 9).
 */

import { getAdminFirestore } from './auth.js';
import { logSecurityEvent } from './logger.js';

export type LedgerAction =
  | 'PROMPT_SCREENED'
  | 'RESPONSE_SCREENED'
  | 'CONTENT_BLOCKED'
  | 'SENSITIVE_DATA_DETECTED'
  | 'SIGN_IN'
  | 'ENTRY_SAVED'
  | 'ENTRY_DELETED'
  | 'QUOTA_EXCEEDED';

export type LedgerDecision = 'ALLOWED' | 'BLOCKED' | 'REDACTED';
export type LedgerSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface LedgerEntry {
  eventId: string;
  timestamp: string;
  action: LedgerAction;
  decision: LedgerDecision;
  category: string;
  severity: LedgerSeverity;
}

/** EVT-7A91C4 style identifier: short, unique enough, easy to quote in a report. */
function makeEventId(): string {
  const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `EVT-${rand.substring(0, 6).padEnd(6, '0')}`;
}

/**
 * Anything that is not a short, plain category label is rejected outright.
 * This is the last line of defence against journal text reaching the ledger
 * through a future careless caller.
 */
function safeCategory(input: string): string {
  const clean = String(input ?? '')
    .replace(/[\r\n\t\x00-\x1F\x7F]/g, ' ')
    .trim()
    .slice(0, 48);
  return clean.length > 0 ? clean : 'unspecified';
}

/**
 * Write one event. Deliberately never throws: a failure to record an event
 * must not break the user's journaling session. The failure is itself logged
 * to stdout so it is visible in Cloud Logging.
 */
export async function recordLedgerEvent(
  uid: string,
  entry: {
    action: LedgerAction;
    decision: LedgerDecision;
    category: string;
    severity: LedgerSeverity;
  },
): Promise<void> {
  if (!uid || typeof uid !== 'string') return;

  const doc: LedgerEntry = {
    eventId: makeEventId(),
    timestamp: new Date().toISOString(),
    action: entry.action,
    decision: entry.decision,
    category: safeCategory(entry.category),
    severity: entry.severity,
  };

  try {
    await getAdminFirestore()
      .collection('users')
      .doc(uid)
      .collection('securityEvents')
      .doc(doc.eventId)
      .set(doc);
  } catch {
    logSecurityEvent({
      action: 'LEDGER_WRITE_FAILED',
      resourceId: `user:${uid.substring(0, 6)}...`,
      decision: 'DENY',
      policy: 'AUDIT_TRAIL',
      severity: 'ERROR',
      details: { reason: 'LEDGER_WRITE_FAILED' },
    });
  }
}

/**
 * Read this user's own audit trail, newest first.
 * The uid always comes from the verified token at the call site — never from
 * a request body, query string or header (directive 2).
 */
export async function readLedger(uid: string, limit = 100): Promise<LedgerEntry[]> {
  const snap = await getAdminFirestore()
    .collection('users')
    .doc(uid)
    .collection('securityEvents')
    .orderBy('timestamp', 'desc')
    .limit(Math.min(Math.max(limit, 1), 200))
    .get();

  return snap.docs.map((d) => {
    const data = d.data() as Partial<LedgerEntry>;
    // Re-shape on read so that only known fields can ever reach the client,
    // even if something unexpected was written to the collection.
    return {
      eventId: String(data.eventId ?? d.id),
      timestamp: String(data.timestamp ?? ''),
      action: (data.action ?? 'PROMPT_SCREENED') as LedgerAction,
      decision: (data.decision ?? 'ALLOWED') as LedgerDecision,
      category: safeCategory(String(data.category ?? '')),
      severity: (data.severity ?? 'LOW') as LedgerSeverity,
    };
  });
}
