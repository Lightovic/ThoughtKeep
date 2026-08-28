/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  onIdTokenChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import type { JournalEntry } from './types.ts';
import firebaseConfig from '../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
});

/**
 * Sign in with Google (The ONLY supported authentication provider for ThoughtKeep)
 */
export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleAuthProvider);
  return result.user;
}

/**
 * Sign out of current session
 */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Retrieves a fresh, verified Firebase ID Token.
 * Automatically requests refresh if the current token is near expiration.
 */
export async function getFreshIdToken(forceRefresh = false): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  try {
    return await currentUser.getIdToken(forceRefresh);
  } catch (error) {
    console.error('Failed to get fresh token:', error);
    return null;
  }
}

/**
 * Sets up background token refresh handler so users in long reflective sessions (>1 hour)
 * are never disrupted by stale credentials.
 */
export function setupTokenRefreshListener(onTokenRefresh?: (token: string | null) => void) {
  // Listen for automatic token rotations
  const unsubscribeToken = onIdTokenChanged(auth, async (user) => {
    if (user) {
      const token = await user.getIdToken();
      onTokenRefresh?.(token);
    } else {
      onTokenRefresh?.(null);
    }
  });

  // Background interval check every 25 minutes
  const intervalId = setInterval(async () => {
    if (auth.currentUser) {
      try {
        await auth.currentUser.getIdToken(true); // Proactively force refresh
      } catch (err) {
        console.warn('Background token refresh check failed:', err);
      }
    }
  }, 25 * 60 * 1000);

  return () => {
    unsubscribeToken();
    clearInterval(intervalId);
  };
}

/**
 * FIRESTORE OWNER-BOUND OPERATIONS (Directive 3)
 * Path: users/{uid}/entries/{entryId}
 */

export async function fetchUserEntries(userId: string): Promise<JournalEntry[]> {
  const currentAuthUid = auth.currentUser?.uid;
  if (!currentAuthUid || currentAuthUid !== userId) return [];

  try {
    const entriesRef = collection(db, 'users', currentAuthUid, 'entries');
    const q = query(entriesRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const entries: JournalEntry[] = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      entries.push({
        id: docSnap.id,
        userId: data.userId || currentAuthUid,
        title: data.title || 'Untitled Reflection',
        summary: data.summary || '',
        messages: (data.messages || []).map((m: any) => ({
          id: m.id || '',
          role: m.role || 'user',
          content: m.content || '',
          timestamp: m.timestamp || '',
          aiProcessing: m.aiProcessing || 'allowed',
        })),
        aiProcessing: data.aiProcessing || 'allowed',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
      });
    });

    return entries;
  } catch (clientErr) {
    console.warn('[ThoughtKeep Diagnostic] Client query failed, checking fallback');
    try {
      const token = await getFreshIdToken();
      if (!token) return [];
      const res = await fetch('/api/entries', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const json = await res.json();
        return (json.entries || []) as JournalEntry[];
      }
    } catch {
      // Fallback exhausted
    }
    return [];
  }
}

export async function saveJournalEntry(
  userId: string,
  entryData: {
    id?: string;
    title: string;
    summary: string;
    messages: JournalEntry['messages'];
    aiProcessing?: 'allowed' | 'never';
    createdAt?: string;
  }
): Promise<string> {
  const currentAuthUid = auth.currentUser?.uid;
  if (!currentAuthUid) {
    const err: any = new Error('auth_missing');
    err.code = 'auth-missing';
    throw err;
  }
  if (userId !== currentAuthUid) {
    const err: any = new Error('auth_mismatch');
    err.code = 'auth-mismatch';
    throw err;
  }

  const entryId =
    typeof entryData.id === 'string' && entryData.id.trim().length > 0
      ? entryData.id.trim()
      : `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowUtc = new Date().toISOString();

  const cleanMessages = (entryData.messages || []).map((m) => ({
    id: m.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    role: m.role === 'model' ? ('model' as const) : ('user' as const),
    content: typeof m.content === 'string' ? m.content : '',
    timestamp: m.timestamp || nowUtc,
    aiProcessing: m.aiProcessing === 'never' ? ('never' as const) : ('allowed' as const),
  }));

  const fullEntry: JournalEntry = {
    id: entryId,
    userId: currentAuthUid,
    title: (entryData.title || (entryData.aiProcessing === 'never' ? 'Private Reflection' : 'Daily Reflection')).trim(),
    summary: (entryData.summary || '').trim(),
    messages: cleanMessages,
    aiProcessing: entryData.aiProcessing === 'never' ? 'never' : 'allowed',
    createdAt: entryData.createdAt || nowUtc,
    updatedAt: nowUtc,
  };

  try {
    const docRef = doc(db, 'users', currentAuthUid, 'entries', entryId);
    await setDoc(docRef, fullEntry);
    return entryId;
  } catch (clientErr) {
    console.warn('[ThoughtKeep Diagnostic] Client setDoc failed, attempting authenticated server fallback');
    try {
      const token = await getFreshIdToken();
      if (token) {
        const res = await fetch('/api/entries', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: fullEntry.id,
            title: fullEntry.title,
            summary: fullEntry.summary,
            messages: fullEntry.messages,
            aiProcessing: fullEntry.aiProcessing,
            createdAt: fullEntry.createdAt,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          return json.id || entryId;
        }
      }
    } catch {
      // Server fallback also failed; re-throw original client error for categorization
    }
    throw clientErr;
  }
}

export async function updateJournalEntry(
  userId: string,
  entryId: string,
  entryData: {
    title?: string;
    summary?: string;
    messages: JournalEntry['messages'];
    aiProcessing?: 'allowed' | 'never';
  }
): Promise<void> {
  const currentAuthUid = auth.currentUser?.uid;

  if (!currentAuthUid) {
    const err: any = new Error('auth_missing');
    err.code = 'auth-missing';
    throw err;
  }

  if (userId !== currentAuthUid) {
    const err: any = new Error('auth_mismatch');
    err.code = 'auth-mismatch';
    throw err;
  }

  const nowUtc = new Date().toISOString();

  const cleanMessages = (entryData.messages || []).map((m) => ({
    id: m.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    role: m.role === 'model' ? ('model' as const) : ('user' as const),
    content: typeof m.content === 'string' ? m.content : '',
    timestamp: m.timestamp || nowUtc,
    aiProcessing: m.aiProcessing === 'never' ? ('never' as const) : ('allowed' as const),
  }));

  const docRef = doc(db, 'users', currentAuthUid, 'entries', entryId);

  const updates: Record<string, unknown> = {
    messages: cleanMessages,
    updatedAt: nowUtc,
    aiProcessing: entryData.aiProcessing === 'never' ? 'never' : 'allowed',
  };

  if (typeof entryData.title === 'string' && entryData.title.trim()) {
    updates.title = entryData.title.trim();
  }

  if (typeof entryData.summary === 'string') {
    updates.summary = entryData.summary.trim();
  }

  await setDoc(docRef, updates, { merge: true });
}

export async function deleteJournalEntry(userId: string, entryId: string): Promise<void> {
  const currentAuthUid = auth.currentUser?.uid;
  if (!currentAuthUid || userId !== currentAuthUid || !entryId) {
    const err: any = new Error('auth_mismatch');
    err.code = 'auth-mismatch';
    throw err;
  }

  try {
    const docRef = doc(db, 'users', currentAuthUid, 'entries', entryId);
    await deleteDoc(docRef);
  } catch (clientErr) {
    console.warn('[ThoughtKeep Diagnostic] Client deleteDoc failed, attempting authenticated server fallback');
    try {
      const token = await getFreshIdToken();
      if (token) {
        const res = await fetch(`/api/entries/${encodeURIComponent(entryId)}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          return;
        }
      }
    } catch {
      // Fallback failed
    }
    throw clientErr;
  }
}
