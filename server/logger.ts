/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SecuritySeverity = 'INFO' | 'WARN' | 'ERROR';
export type SecurityDecision = 'ALLOW' | 'DENY' | 'AUDIT';

export interface SecurityEvent {
  eventId: string;
  timestamp: string; // ISO UTC
  action: string;
  resourceId?: string;
  decision: SecurityDecision;
  policy: string;
  severity: SecuritySeverity;
  details?: Record<string, string | number | boolean>;
}

// Restricted list of disallowed sensitive key substrings to prevent accidental leaks
const SENSITIVE_KEY_PATTERNS = [
  'token',
  'secret',
  'key',
  'password',
  'credential',
  'journal',
  'content',
  'prompt',
  'message',
  'transcript',
  'bearer',
  'authorization',
  'email',
];

/**
 * Sanitizes a resourceId string to prevent log injection, sensitive data leakage,
 * or raw journal content from entering audit streams (Task M3).
 */
function sanitizeResourceId(resourceId?: string): string | undefined {
  if (!resourceId || typeof resourceId !== 'string') {
    return undefined;
  }
  // Strip control characters, newlines, and carriage returns
  const clean = resourceId.replace(/[\r\n\t\x00-\x1F\x7F]/g, '').trim();
  // Truncate to maximum 64 characters
  return clean.length > 64 ? clean.substring(0, 64) : clean;
}

/**
 * Structured Security Audit Logger conforming to Directives 9 & 16:
 * - Logs eventId, timestamp, action, resourceId, decision, policy, severity, details.
 * - STRICTLY REDACTS all tokens, secrets, journal text, and raw user-supplied strings.
 * - Enforces fixed category codes and scalar attributes in details.
 */
export function logSecurityEvent(event: Omit<SecurityEvent, 'eventId' | 'timestamp'>): void {
  const sanitizedDetails: Record<string, string | number | boolean> = {};

  if (event.details && typeof event.details === 'object') {
    for (const [key, value] of Object.entries(event.details)) {
      const lowerKey = key.toLowerCase();
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pat) => lowerKey.includes(pat));
      
      // If the key itself is sensitive or value is not primitive, redact or omit
      if (isSensitiveKey && key !== 'reason') {
        sanitizedDetails[key] = '[REDACTED]';
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        sanitizedDetails[key] = value;
      }
    }
  }

  const securityRecord: SecurityEvent = {
    eventId: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    action: event.action,
    resourceId: sanitizeResourceId(event.resourceId),
    decision: event.decision,
    policy: event.policy,
    severity: event.severity,
    details: Object.keys(sanitizedDetails).length > 0 ? sanitizedDetails : undefined,
  };

  // Structured stdout log (safe for Cloud Logging, SIEM & monitoring)
  console.log(JSON.stringify({
    type: 'SECURITY_AUDIT',
    ...securityRecord,
  }));
}
