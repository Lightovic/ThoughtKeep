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
  if (!userId) return [];
  const entriesRef = collection(db, 'users', userId, 'entries');
  const q = query(entriesRef, orderBy('createdAt', 'desc'));
  
  const querySnapshot = await getDocs(q);
  const entries: JournalEntry[] = [];

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    entries.push({
      id: docSnap.id,
      userId: data.userId || userId,
      title: data.title || 'Untitled Reflection',
      summary: data.summary || '',
      messages: data.messages || [],
      aiProcessing: data.aiProcessing || 'allowed',
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    });
  });

  return entries;
}

export async function saveJournalEntry(
  userId: string,
  entryData: {
    title: string;
    summary: string;
    messages: JournalEntry['messages'];
    aiProcessing?: 'allowed' | 'never';
  }
): Promise<string> {
  if (!userId) throw new Error('Cannot save entry without authenticated user ID');

  const entryId = `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowUtc = new Date().toISOString();

  const docRef = doc(db, 'users', userId, 'entries', entryId);
  const fullEntry: JournalEntry = {
    id: entryId,
    userId,
    title: entryData.title.trim() || 'Daily Reflection',
    summary: entryData.summary.trim(),
    messages: entryData.messages,
    aiProcessing: entryData.aiProcessing || 'allowed',
    createdAt: nowUtc,
    updatedAt: nowUtc,
  };

  await setDoc(docRef, fullEntry);
  return entryId;
}

export async function deleteJournalEntry(userId: string, entryId: string): Promise<void> {
  if (!userId || !entryId) throw new Error('Missing parameters for entry deletion');
  const docRef = doc(db, 'users', userId, 'entries', entryId);
  await deleteDoc(docRef);
}
