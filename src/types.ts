/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string; // ISO UTC string
  aiProcessing?: 'allowed' | 'never';
}

export interface JournalEntry {
  id: string;
  userId: string;
  title: string;
  summary: string;
  messages: ChatMessage[];
  aiProcessing: 'allowed' | 'never';
  retention?: 'forever' | '7d' | '30d' | '365d';
  expiresAt?: unknown;
  createdAt: string; // ISO UTC string
  updatedAt: string; // ISO UTC string
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}
