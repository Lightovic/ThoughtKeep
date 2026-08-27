/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { Response, NextFunction } from 'express';
import {
  enforceIdentityPolicy,
  requireAuth,
  AuthVerificationError,
  type AuthenticatedRequest,
  type VerifiedUser,
} from './auth.js';

// Helper to construct mock DecodedIdToken shapes for pure policy tests
function createMockDecodedToken(overrides: Partial<DecodedIdToken> = {}): DecodedIdToken {
  return {
    aud: 'true-rampart-464602-i0',
    auth_time: Math.floor(Date.now() / 1000) - 60,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000) - 60,
    iss: 'https://securetoken.google.com/true-rampart-464602-i0',
    sub: 'google-uid-1234567890',
    uid: 'google-uid-1234567890',
    email: 'user@example.com',
    email_verified: true,
    firebase: {
      identities: { 'google.com': ['google-uid-1234567890'] },
      sign_in_provider: 'google.com',
    },
    ...overrides,
  } as unknown as DecodedIdToken;
}

// Helper to create mock Express request/response objects for middleware tests
function createMockHttp(headers: Record<string, string> = {}, path = '/api/chat/stream') {
  const req = {
    headers,
    path,
    user: undefined as VerifiedUser | undefined,
  } as unknown as AuthenticatedRequest;

  let statusCode = 200;
  let jsonResponse: any = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      jsonResponse = data;
      return this;
    },
  } as unknown as Response;

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getJsonResponse: () => jsonResponse,
  };
}

describe('Identity Policy Control Tests (enforceIdentityPolicy)', () => {
  it('POSITIVE: Valid Google-signed-in, email-verified token admits user with matching UID', () => {
    const mockToken = createMockDecodedToken({
      uid: 'valid-google-user-id',
      email: 'member@domain.com',
      email_verified: true,
      firebase: {
        identities: { 'google.com': ['valid-google-user-id'] },
        sign_in_provider: 'google.com',
      },
    });

    const verifiedUser = enforceIdentityPolicy(mockToken);

    assert.equal(verifiedUser.uid, 'valid-google-user-id');
    assert.equal(verifiedUser.email, 'member@domain.com');
    assert.equal(verifiedUser.emailVerified, true);
  });

  it('NEGATIVE: email_verified === false throws EMAIL_NOT_VERIFIED', () => {
    const mockToken = createMockDecodedToken({
      email_verified: false,
    });

    assert.throws(
      () => enforceIdentityPolicy(mockToken),
      (err: unknown) => {
        assert.ok(err instanceof AuthVerificationError);
        assert.equal(err.category, 'EMAIL_NOT_VERIFIED');
        return true;
      }
    );
  });

  it('NEGATIVE: email_verified absent/undefined throws EMAIL_NOT_VERIFIED', () => {
    const mockToken = createMockDecodedToken({
      email_verified: undefined,
    });

    assert.throws(
      () => enforceIdentityPolicy(mockToken),
      (err: unknown) => {
        assert.ok(err instanceof AuthVerificationError);
        assert.equal(err.category, 'EMAIL_NOT_VERIFIED');
        return true;
      }
    );
  });

  it('NEGATIVE: non-Google sign-in provider (e.g. password) throws PROVIDER_NOT_ALLOWED', () => {
    const mockToken = createMockDecodedToken({
      firebase: {
        identities: { email: ['user@example.com'] },
        sign_in_provider: 'password',
      },
    });

    assert.throws(
      () => enforceIdentityPolicy(mockToken),
      (err: unknown) => {
        assert.ok(err instanceof AuthVerificationError);
        assert.equal(err.category, 'PROVIDER_NOT_ALLOWED');
        return true;
      }
    );
  });

  it('NEGATIVE: firebase claim absent entirely throws PROVIDER_NOT_ALLOWED', () => {
    const mockToken = createMockDecodedToken({
      firebase: undefined,
    });

    assert.throws(
      () => enforceIdentityPolicy(mockToken),
      (err: unknown) => {
        assert.ok(err instanceof AuthVerificationError);
        assert.equal(err.category, 'PROVIDER_NOT_ALLOWED');
        return true;
      }
    );
  });

  it('NEGATIVE: empty or whitespace uid throws TOKEN_INVALID', () => {
    const mockTokenEmptyUid = createMockDecodedToken({
      uid: '',
    });

    assert.throws(
      () => enforceIdentityPolicy(mockTokenEmptyUid),
      (err: unknown) => {
        assert.ok(err instanceof AuthVerificationError);
        assert.equal(err.category, 'TOKEN_INVALID');
        return true;
      }
    );

    const mockTokenWhitespaceUid = createMockDecodedToken({
      uid: '   ',
    });

    assert.throws(
      () => enforceIdentityPolicy(mockTokenWhitespaceUid),
      (err: unknown) => {
        assert.ok(err instanceof AuthVerificationError);
        assert.equal(err.category, 'TOKEN_INVALID');
        return true;
      }
    );
  });
});

describe('Middleware Ingress Control Tests (requireAuth)', () => {
  it('NEGATIVE: Missing Authorization header rejects with 401 and AUTH_REQUIRED', async () => {
    const { req, res, getStatusCode, getJsonResponse } = createMockHttp({});
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };

    await requireAuth(req, res, next);

    assert.equal(nextCalled, false);
    assert.equal(getStatusCode(), 401);
    assert.equal(getJsonResponse().code, 'AUTH_REQUIRED');
  });

  it('NEGATIVE: Empty Bearer token rejects with 401 and AUTH_REQUIRED', async () => {
    const { req, res, getStatusCode, getJsonResponse } = createMockHttp({
      authorization: 'Bearer   ',
    });
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };

    await requireAuth(req, res, next);

    assert.equal(nextCalled, false);
    assert.equal(getStatusCode(), 401);
    assert.equal(getJsonResponse().code, 'AUTH_REQUIRED');
  });

  /**
   * Note on what this test does and does NOT prove:
   * This test passes a malformed token string to requireAuth, expecting a 401 UNAUTHORIZED rejection.
   * However, its outcome in an automated test environment depends on whether Application Default
   * Credentials (ADC) are configured. If ADC credentials are absent in the test runner environment,
   * the Admin SDK may throw an initialization/credential error rather than a token parsing error.
   * Both pathways result in a 401 UNAUTHORIZED rejection, meaning the test can pass for the wrong
   * reason (missing ambient credentials rather than token validation failure). Pure token policy
   * coverage is therefore verified deterministically above via enforceIdentityPolicy().
   */
  it('NEGATIVE (INTEGRATION): Malformed Bearer token fails closed with 401 UNAUTHORIZED', async () => {
    const { req, res, getStatusCode, getJsonResponse } = createMockHttp({
      authorization: 'Bearer invalid.token.payload',
    });
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };

    await requireAuth(req, res, next);

    assert.equal(nextCalled, false);
    assert.equal(getStatusCode(), 401);
    assert.equal(getJsonResponse().code, 'UNAUTHORIZED');
  });
});
