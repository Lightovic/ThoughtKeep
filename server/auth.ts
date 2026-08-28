/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Request, Response, NextFunction } from 'express';
import { logSecurityEvent } from './logger.js';

export const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'true-rampart-464602-i0';

/**
 * Token revocation checking.
 * Trade-off: Enabling this (true) checks revocation status against Firebase Auth on every request,
 * which is strictly more correct if user credentials or sessions are invalidated immediately,
 * but costs an extra network round-trip to the Firebase Auth backend on each API call.
 * Default is false.
 */
export const CHECK_REVOCATION = false;

/**
 * Fixed auth failure categories (Task 3 / Directive 9).
 * Logged exclusively as fixed enum codes; raw error messages, tokens, and claims are NEVER logged.
 */
export type AuthFailureCategory =
  | 'MISSING_BEARER'
  | 'EMPTY_TOKEN'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'EMAIL_NOT_VERIFIED'
  | 'PROVIDER_NOT_ALLOWED';

export class AuthVerificationError extends Error {
  readonly category: AuthFailureCategory;

  constructor(category: AuthFailureCategory) {
    super(category);
    this.category = category;
    this.name = 'AuthVerificationError';
  }
}

/**
 * Initialize the Firebase Admin SDK exactly once, guarded against repeated imports.
 * Uses Application Default Credentials (ADC) provided by Cloud Run / GCP runtime,
 * with explicit project binding to ensure tokens are validated against the intended project.
 * 
 * LOCAL DEVELOPMENT:
 * Run `gcloud auth application-default login` to establish Application Default Credentials.
 * 
 * ABSOLUTELY NO service-account JSON key files, credential file paths, or private keys
 * are used or referenced. If credentials are unavailable, initialization fails loudly at startup.
 */
function getAdminApp(): App {
  if (getApps().length === 0) {
    return initializeApp({
      projectId: FIREBASE_PROJECT_ID,
    });
  }
  return getApp();
}

function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

export interface VerifiedUser {
  uid: string;
  email?: string;
  emailVerified: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: VerifiedUser;
}

/**
 * Enforces identity policy against an already-verified DecodedIdToken.
 * Pure function: runs independently of network I/O or credentials.
 * 
 * In order:
 * 1. Requires email_verified === true, else throws EMAIL_NOT_VERIFIED
 * 2. Requires firebase.sign_in_provider === "google.com", else throws PROVIDER_NOT_ALLOWED
 * 3. Requires uid to be a non-empty string, else throws TOKEN_INVALID
 */
export function enforceIdentityPolicy(decoded: DecodedIdToken): VerifiedUser {
  // 1. Assert email_verified === true
  if (decoded.email_verified !== true) {
    throw new AuthVerificationError('EMAIL_NOT_VERIFIED');
  }

  // 2. Assert Google Sign-In is the only allowed provider
  const signInProvider = decoded.firebase?.sign_in_provider;
  if (signInProvider !== 'google.com') {
    throw new AuthVerificationError('PROVIDER_NOT_ALLOWED');
  }

  // 3. Derive UID only from verified token
  const uid = decoded.uid;
  if (!uid || typeof uid !== 'string' || uid.trim() === '') {
    throw new AuthVerificationError('TOKEN_INVALID');
  }

  return {
    uid,
    email: decoded.email,
    emailVerified: decoded.email_verified,
  };
}

/**
 * Verifies a Firebase ID Token using the Firebase Admin SDK.
 * 
 * 1. Admin SDK's verifyIdToken() performs cryptographic signature verification,
 *    timestamp checks (exp, iat, nbf), audience (aud), issuer (iss), and algorithm
 *    against Google's rotating public certificates BEFORE any claim is exposed (Task 1).
 * 2. Enforces identity policy via enforceIdentityPolicy() (Task 2).
 * 3. Derives UID strictly from the verified token payload.
 */
export async function verifyFirebaseIdToken(
  token: string,
  checkRevoked = CHECK_REVOCATION
): Promise<VerifiedUser> {
  const adminAuth = getAdminAuth();

  let decodedToken: DecodedIdToken;
  try {
    decodedToken = await adminAuth.verifyIdToken(token, checkRevoked);
  } catch (err: any) {
    const errorCode = err?.code || '';
    if (errorCode === 'auth/id-token-expired') {
      throw new AuthVerificationError('TOKEN_EXPIRED');
    }
    if (errorCode === 'auth/id-token-revoked') {
      throw new AuthVerificationError('TOKEN_REVOKED');
    }
    throw new AuthVerificationError('TOKEN_INVALID');
  }

  return enforceIdentityPolicy(decodedToken);
}

/**
 * Express middleware to enforce authentication on protected endpoints.
 * 
 * - Sole entry point for establishing identity (Task 8 / Directive 2).
 * - Logs fixed category codes ONLY; never logs tokens, claims, or raw error messages (Task 3 / Directive 9).
 * - Fails closed with clean, non-leaking user message (Directives 10 & 16).
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logSecurityEvent({
      action: 'API_AUTH_CHECK',
      decision: 'DENY',
      policy: 'BEARER_TOKEN_REQUIRED',
      severity: 'WARN',
      details: {
        reason: 'MISSING_BEARER',
        path: req.path,
      },
    });
    res.status(401).json({
      error: 'Authentication required. Please sign in to continue.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    logSecurityEvent({
      action: 'API_AUTH_CHECK',
      decision: 'DENY',
      policy: 'BEARER_TOKEN_REQUIRED',
      severity: 'WARN',
      details: {
        reason: 'EMPTY_TOKEN',
        path: req.path,
      },
    });
    res.status(401).json({
      error: 'Authentication required. Please sign in to continue.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  try {
    const verifiedUser = await verifyFirebaseIdToken(token);
    req.user = verifiedUser;

    logSecurityEvent({
      action: 'API_AUTH_SUCCESS',
      resourceId: `user:${verifiedUser.uid.substring(0, 6)}...`, // Redacted prefix only
      decision: 'ALLOW',
      policy: 'SERVER_VERIFIED_IDENTITY',
      severity: 'INFO',
      details: {
        path: req.path,
      },
    });

    next();
  } catch (error: any) {
    const failureCategory: AuthFailureCategory =
      error instanceof AuthVerificationError ? error.category : 'TOKEN_INVALID';

    logSecurityEvent({
      action: 'API_AUTH_FAILURE',
      decision: 'DENY',
      policy: 'SERVER_VERIFIED_IDENTITY',
      severity: 'WARN',
      details: {
        reason: failureCategory,
        path: req.path,
      },
    });

    res.status(401).json({
      error: 'Your session has expired or is invalid. Please sign in again.',
      code: 'UNAUTHORIZED',
    });
  }
}
