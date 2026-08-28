/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SaveFailureCategory =
  | 'SAVE_AUTH_MISSING'
  | 'SAVE_PERMISSION_DENIED'
  | 'SAVE_INVALID_ARGUMENT'
  | 'SAVE_NOT_FOUND'
  | 'SAVE_NETWORK'
  | 'SAVE_PROJECT_MISMATCH'
  | 'SAVE_UNKNOWN';

export interface ClassifiedSaveError {
  category: SaveFailureCategory;
  userFacingMessage: string;
}

/**
 * Classifies runtime errors during the Save Entry flow into fixed categories
 * and produces safe, calm, non-technical user-facing messages.
 * 
 * Strict Hygiene:
 * - NEVER logs or exposes tokens, secrets, UIDs, document content, or raw exception stack traces.
 */
export function classifySaveError(err: any): ClassifiedSaveError {
  const code = (err?.code || '').toString().toLowerCase();
  const name = (err?.name || '').toString();
  const message = (err?.message || '').toString().toLowerCase();

  // 1. Authentication missing or mismatch
  if (
    code === 'auth-missing' ||
    code === 'auth_missing' ||
    message.includes('auth_missing') ||
    message.includes('must be signed in') ||
    message.includes('session has expired')
  ) {
    return {
      category: 'SAVE_AUTH_MISSING',
      userFacingMessage: 'Your session has expired or is invalid. Please sign in again.',
    };
  }

  // 2. Permission denied / unauthorized
  if (
    code === 'permission-denied' ||
    code === 'auth-mismatch' ||
    code === 'unauthorized' ||
    message.includes('permission-denied') ||
    message.includes('permission_denied') ||
    message.includes('unauthorized') ||
    message.includes('access was not available')
  ) {
    return {
      category: 'SAVE_PERMISSION_DENIED',
      userFacingMessage: 'Your entry could not be saved because access was not available. Please try again.',
    };
  }

  // 3. Network / connection issues
  if (
    code === 'unavailable' ||
    code === 'network-request-failed' ||
    code === 'deadline-exceeded' ||
    name === 'AbortError' ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('connection was interrupted')
  ) {
    return {
      category: 'SAVE_NETWORK',
      userFacingMessage: 'Your entry could not be saved because the connection was interrupted. Your conversation is still here — please try again.',
    };
  }

  // 4. Invalid arguments
  if (
    code === 'invalid-argument' ||
    code === 'out-of-range' ||
    message.includes('invalid argument')
  ) {
    return {
      category: 'SAVE_INVALID_ARGUMENT',
      userFacingMessage: 'Your entry could not be saved due to an invalid format. Your conversation is still here — please try again.',
    };
  }

  // 5. Not found
  if (code === 'not-found' || message.includes('not-found')) {
    return {
      category: 'SAVE_NOT_FOUND',
      userFacingMessage: 'Your entry could not be saved right now. Your conversation is still here — please try again.',
    };
  }

  // 6. Default unknown
  return {
    category: 'SAVE_UNKNOWN',
    userFacingMessage: 'Your entry could not be saved right now. Your conversation is still here — please try again.',
  };
}
