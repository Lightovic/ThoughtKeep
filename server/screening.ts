/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logSecurityEvent } from './logger.js';
import { gateInbound, gateOutbound, GateBlockedError } from './modelArmor.js';

export { GateBlockedError };

/**
 * SCREENING CHOKE POINTS (Directive 5)
 *
 * All inbound content heading to Gemini passes through screenInbound().
 * All outbound model content passes through screenOutbound().
 *
 * As of Phase 4 these are no longer pass-throughs: they call Google Cloud
 * Model Armor ("The Gate"). Both directions fail closed.
 */

export interface ScreeningContext {
  userId: string;
  source: 'journal_chat' | 'entry_summary' | 'entry_context';
  entryAiProcessing?: 'allowed' | 'never';
}

const MAX_INPUT_LENGTH = 32768;

const TK_SECRET_PATTERN_MARKER = 'PHASE4_SECRET_PATTERN_PROTECTION';

/**
 * Phase 4 defense-in-depth secret detector.
 *
 * Model Armor remains the primary content-security gate.
 * These deterministic patterns protect against common credential formats
 * that may not be covered by the template's configured basic SDP detectors.
 *
 * We never log or return the matched secret.
 */
const SENSITIVE_SECRET_PATTERNS: RegExp[] = [
  // Google API keys commonly begin with AIza.
  /AIza[0-9A-Za-z_-]{16,}/,

  // GitHub personal/access tokens.
  /gh[pousr]_[A-Za-z0-9_]{20,}/,

  // AWS access-key identifiers.
  /AKIA[0-9A-Z]{16}/,

  // PEM private keys.
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,

  // Common OpenAI-style secret keys.
  /sk-[A-Za-z0-9_-]{20,}/,
];

function detectSensitiveSecret(content: string): boolean {
  if (typeof content !== 'string' || !content) return false;
  return SENSITIVE_SECRET_PATTERNS.some((pattern) => pattern.test(content));
}


export async function screenInbound(content: string, context: ScreeningContext): Promise<string> {
  // Directive 14: absolute AI-processing boundary, fails closed.
  if (context.entryAiProcessing !== 'allowed') {
    logSecurityEvent({
      action: 'SCREEN_INBOUND_BLOCKED',
      resourceId: `user:${context.userId.substring(0, 6)}...`,
      decision: 'DENY',
      policy: 'AI_PROCESSING_BOUNDARY',
      severity: 'WARN',
      details: { reason: 'AI_PROCESSING_FORBIDDEN' },
    });
    throw new Error('AI processing is forbidden for this journal entry by user policy');
  }

  if (typeof content !== 'string') {
    throw new Error('Invalid content type for inbound model screening');
  }

  if (content.length > MAX_INPUT_LENGTH) {
    logSecurityEvent({
      action: 'SCREEN_INBOUND_TRUNCATE_OR_REJECT',
      resourceId: `user:${context.userId.substring(0, 6)}...`,
      decision: 'DENY',
      policy: 'INPUT_LENGTH_LIMIT',
      severity: 'WARN',
      details: { reason: 'INPUT_LENGTH_EXCEEDED' },
    });
    throw new Error('Input content exceeds maximum allowed length for journal reflection');
  }

  // Defense-in-depth: block obvious credentials before they reach Gemini.
  // This is intentionally before Model Armor because the safest secret is one
  // that never reaches the model at all.
  if (detectSensitiveSecret(content)) {
    logSecurityEvent({
      action: 'GATE_INBOUND_BLOCKED',
      resourceId: `user:${context.userId.substring(0, 6)}...`,
      decision: 'DENY',
      policy: 'SENSITIVE_DATA_PATTERN',
      severity: 'WARN',
      details: { reason: 'SENSITIVE_DATA_DETECTED', category: 'sensitive data' },
    });
    throw new GateBlockedError('sensitive data', 'inbound');
  }

  // THE GATE — inbound.
  try {
    await gateInbound(content);
  } catch (err) {
    if (err instanceof GateBlockedError) {
      logSecurityEvent({
        action: 'GATE_INBOUND_BLOCKED',
        resourceId: `user:${context.userId.substring(0, 6)}...`,
        decision: 'DENY',
        policy: 'MODEL_ARMOR_GATE',
        severity: 'WARN',
        // Category only. Never the message, never the matched rule.
        details: { reason: 'CONTENT_BLOCKED', category: err.category },
      });
    }
    throw err;
  }

  logSecurityEvent({
    action: 'GATE_INBOUND_ALLOWED',
    resourceId: `user:${context.userId.substring(0, 6)}...`,
    decision: 'ALLOW',
    policy: 'MODEL_ARMOR_GATE',
    severity: 'INFO',
    details: { reason: 'PROMPT_SCREENED' },
  });

  return content;
}

export async function screenOutbound(content: string, context: ScreeningContext): Promise<string> {
  if (typeof content !== 'string') {
    throw new Error('Invalid content type for outbound model screening');
  }

  // Defense-in-depth: never allow a recognizable credential to reach
  // the browser, even if Model Armor's configured SDP detector misses it.
  if (detectSensitiveSecret(content)) {
    logSecurityEvent({
      action: 'GATE_OUTBOUND_BLOCKED',
      resourceId: `user:${context.userId.substring(0, 6)}...`,
      decision: 'DENY',
      policy: 'SENSITIVE_DATA_PATTERN',
      severity: 'WARN',
      details: { reason: 'SENSITIVE_DATA_DETECTED', category: 'sensitive data' },
    });
    throw new GateBlockedError('sensitive data', 'outbound');
  }

  // THE GATE — outbound. Runs BEFORE any byte reaches the client.
  try {
    await gateOutbound(content);
  } catch (err) {
    if (err instanceof GateBlockedError) {
      logSecurityEvent({
        action: 'GATE_OUTBOUND_BLOCKED',
        resourceId: `user:${context.userId.substring(0, 6)}...`,
        decision: 'DENY',
        policy: 'MODEL_ARMOR_GATE',
        severity: 'WARN',
        details: { reason: 'RESPONSE_BLOCKED', category: err.category },
      });
    }
    throw err;
  }

  logSecurityEvent({
    action: 'GATE_OUTBOUND_ALLOWED',
    resourceId: `user:${context.userId.substring(0, 6)}...`,
    decision: 'ALLOW',
    policy: 'MODEL_ARMOR_GATE',
    severity: 'INFO',
    details: { reason: 'RESPONSE_SCREENED' },
  });

  return content;
}
