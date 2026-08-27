/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logSecurityEvent } from './logger.js';

/**
 * SCREENING CHOKE POINTS (Directive 5 & Phase 1 Specification)
 *
 * All inbound user/document content heading to Gemini MUST pass through screenInbound().
 * All outbound model content returning to the client MUST pass through screenOutbound().
 *
 * In this baseline phase, they perform structural validation and safety boundary assertions,
 * passing content through unchanged. They are the single insertion point for Model Armor in Phase 2.
 */

export interface ScreeningContext {
  userId: string;
  source: 'journal_chat' | 'entry_summary' | 'entry_context';
  entryAiProcessing?: 'allowed' | 'never';
}

/**
 * Inbound screening choke point.
 * Ensures user-set AI-processing policy is respected before sending text to Gemini.
 * 
 * DIRECTIVE 14: The AI-processing boundary is absolute.
 * Fails closed: treats missing, unreadable, or 'never' policy as forbidden ('never').
 */
export async function screenInbound(content: string, context: ScreeningContext): Promise<string> {
  // Directive 14: Absolute AI processing boundary (fail closed)
  if (context.entryAiProcessing !== 'allowed') {
    logSecurityEvent({
      action: 'SCREEN_INBOUND_BLOCKED',
      resourceId: `user:${context.userId.substring(0, 6)}...`,
      decision: 'DENY',
      policy: 'AI_PROCESSING_BOUNDARY',
      severity: 'WARN',
      details: { reason: 'AI_PROCESSING_FORBIDDEN' }
    });
    throw new Error('AI processing is forbidden for this journal entry by user policy');
  }

  // Baseline input validation: text must be a string and under maximum payload threshold (32KB)
  if (typeof content !== 'string') {
    throw new Error('Invalid content type for inbound model screening');
  }

  const MAX_INPUT_LENGTH = 32768; // 32KB text limit per turn
  if (content.length > MAX_INPUT_LENGTH) {
    logSecurityEvent({
      action: 'SCREEN_INBOUND_TRUNCATE_OR_REJECT',
      resourceId: `user:${context.userId.substring(0, 6)}...`,
      decision: 'DENY',
      policy: 'INPUT_LENGTH_LIMIT',
      severity: 'WARN',
      details: { reason: 'INPUT_LENGTH_EXCEEDED' }
    });
    throw new Error('Input content exceeds maximum allowed length for journal reflection');
  }

  // Model Armor Phase 2 Insertion Point:
  // In Phase 2, Model Armor API will inspect content for prompt injections and malicious content here.
  return content;
}

/**
 * Outbound screening choke point.
 * Ensures model response complies with security policies before being returned to user.
 */
export async function screenOutbound(content: string, _context: ScreeningContext): Promise<string> {
  if (typeof content !== 'string') {
    throw new Error('Invalid content type for outbound model screening');
  }

  // Model Armor Phase 2 Insertion Point:
  // In Phase 2, Model Armor API will screen generated responses here.
  return content;
}
