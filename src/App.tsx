/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  signInWithGoogle,
  signOut,
  fetchUserEntries,
  setupTokenRefreshListener,
} from './firebase.ts';
import type { UserProfile, JournalEntry, ChatMessage } from './types.ts';
import { Navbar } from './components/Navbar.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { JournalChat } from './components/JournalChat.tsx';
import { HistoryView } from './components/HistoryView.tsx';
import { ConfirmationModal } from './components/ConfirmationModal.tsx';
import { SecurityAuditModal } from './components/SecurityAuditModal.tsx';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isAuthInitializing, setIsAuthInitializing] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  // App Navigation View
  const [activeView, setActiveView] = useState<'journal' | 'history'>('journal');

  // Lifted Active Conversation State (Issue 2: survives view switching)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInputText, setChatInputText] = useState<string>('');
  const [preventAiProcessing, setPreventAiProcessing] = useState<boolean>(false);

  // Entries State
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [isEntriesLoading, setIsEntriesLoading] = useState(false);

  // Sign out confirmation modal state
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);

  // Security Posture Modal State
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);

  // Listen to Auth state changes and token refresh events
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        const profile: UserProfile = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          emailVerified: user.emailVerified,
        };
        setCurrentUser(profile);
        loadEntries(user.uid);
      } else {
        setCurrentUser(null);
        setEntries([]);
        setChatMessages([]);
        setChatInputText('');
        setPreventAiProcessing(false);
      }
      setIsAuthInitializing(false);
    });

    const cleanupRefresh = setupTokenRefreshListener();

    return () => {
      unsubscribeAuth();
      cleanupRefresh();
    };
  }, []);

  const loadEntries = async (uid: string) => {
    setIsEntriesLoading(true);
    try {
      const userEntries = await fetchUserEntries(uid);
      setEntries(userEntries);
    } catch (err) {
      console.warn('Failed to load user journal entries:', err);
    } finally {
      setIsEntriesLoading(false);
    }
  };

  const handleSignInWithGoogle = async () => {
    setIsSigningIn(true);
    setSignInError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      console.error('Sign-in error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setSignInError('Sign in was cancelled. You may try again whenever you are ready.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setSignInError('This domain is not authorized for Google Sign-In in Firebase. Please check authorized domains in Firebase Console.');
      } else {
        setSignInError('Unable to connect to Google account service. Please check your network and try again.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleConfirmSignOut = async () => {
    try {
      await signOut();
      setChatMessages([]);
      setChatInputText('');
      setPreventAiProcessing(false);
      setIsSignOutModalOpen(false);
      setActiveView('journal');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleEntrySaved = (newEntry: JournalEntry) => {
    setEntries((prev) => [newEntry, ...prev]);
    setActiveView('history');
  };

  const handleEntryDeleted = (deletedEntryId: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== deletedEntryId));
  };

  // Initial Auth Loading Screen
  if (isAuthInitializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 font-serif text-lg font-bold text-slate-50 shadow-md">
            TK
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
            <span>Establishing secure session...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="thoughtkeep-app-root" className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col selection:bg-slate-900 selection:text-white">
      {/* Top App Header & Navigation */}
      <Navbar
        user={currentUser}
        activeView={activeView}
        historyCount={entries.length}
        onNavigate={(view) => setActiveView(view)}
        onOpenSecurity={() => setIsSecurityModalOpen(true)}
        onRequestSignOut={() => setIsSignOutModalOpen(true)}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col">
        {!currentUser ? (
          <LandingPage
            onSignIn={handleSignInWithGoogle}
            isLoading={isSigningIn}
            errorMessage={signInError}
            onClearError={() => setSignInError(null)}
          />
        ) : (
          <main id="authenticated-workspace" className="flex-1 flex flex-col max-w-5xl w-full mx-auto">
            <div className={`flex-1 flex flex-col ${activeView === 'journal' ? 'flex' : 'hidden'}`}>
              <JournalChat
                userId={currentUser.uid}
                messages={chatMessages}
                setMessages={setChatMessages}
                inputText={chatInputText}
                setInputText={setChatInputText}
                preventAiProcessing={preventAiProcessing}
                setPreventAiProcessing={setPreventAiProcessing}
                onEntrySaved={handleEntrySaved}
              />
            </div>
            {activeView === 'history' && (
              <div className="flex-1 flex flex-col">
                <HistoryView
                  userId={currentUser.uid}
                  entries={entries}
                  isLoading={isEntriesLoading}
                  onEntryDeleted={handleEntryDeleted}
                  onStartNewJournal={() => setActiveView('journal')}
                />
              </div>
            )}
          </main>
        )}
      </div>

      {/* Sign Out Confirmation Modal (Directive 8) */}
      <ConfirmationModal
        isOpen={isSignOutModalOpen}
        title="Sign Out of ThoughtKeep"
        description="Are you sure you want to end your current ThoughtKeep session? Any unsaved conversation turns will be cleared from local memory."
        confirmLabel="Sign Out"
        onConfirm={handleConfirmSignOut}
        onCancel={() => setIsSignOutModalOpen(false)}
      />

      {/* Security Posture Transparency Modal */}
      <SecurityAuditModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
      />
    </div>
  );
}
