/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  BookOpen,
  Calendar,
  Trash2,
  ChevronRight,
  Shield,
  MessageSquare,
  Search,
  ArrowLeft,
  Clock,
  RotateCcw,
} from 'lucide-react';
import type { JournalEntry } from '../types.ts';
import { deleteJournalEntry } from '../firebase.ts';
import { ConfirmationModal } from './ConfirmationModal.tsx';
import { CopyMessageButton } from './CopyMessageButton.tsx';

interface HistoryViewProps {
  userId: string;
  entries: JournalEntry[];
  isLoading: boolean;
  onEntryDeleted: (entryId: string) => void;
  onStartNewJournal: () => void;
  onResumeEntry: (entry: JournalEntry) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  userId,
  entries,
  isLoading,
  onEntryDeleted,
  onStartNewJournal,
  onResumeEntry,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<JournalEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter entries based on search query
  const filteredEntries = entries.filter((e) => {
    const q = searchQuery.toLowerCase();
    return (
      e.title.toLowerCase().includes(q) ||
      e.summary.toLowerCase().includes(q) ||
      e.messages.some((m) => m.content.toLowerCase().includes(q))
    );
  });

  const handleConfirmDelete = async () => {
    if (!entryToDelete) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deleteJournalEntry(userId, entryToDelete.id);
      onEntryDeleted(entryToDelete.id);
      if (selectedEntry?.id === entryToDelete.id) {
        setSelectedEntry(null);
      }
      setEntryToDelete(null);
    } catch (_err: any) {
      setErrorMessage(
        'We could not delete this journal entry right now. Please try again in a moment.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const formatTimestamp = (utcIsoString: string) => {
    try {
      const d = new Date(utcIsoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return utcIsoString;
    }
  };

  // If a single entry is selected for full reading
  if (selectedEntry) {
    return (
      <div id="entry-detail-view" className="h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Top navigation */}
          <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
            <button
              id="back-to-history-list-btn"
              type="button"
              onClick={() => setSelectedEntry(null)}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-slate-300"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to all entries</span>
            </button>

            <div className="flex items-center gap-2">
              {selectedEntry.aiProcessing === 'never' ? (
                <span
                  id="private-entry-read-only"
                  className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500"
                  title="This entry was explicitly excluded from AI processing"
                >
                  Read-only · AI excluded
                </span>
              ) : (
                <button
                  id="resume-selected-entry-btn"
                  type="button"
                  onClick={() => onResumeEntry(selectedEntry)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-950 focus:outline-hidden focus:ring-2 focus:ring-slate-300"
                  title="Resume this saved conversation"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Resume conversation</span>
                </button>
              )}

              <button
                id="delete-selected-entry-btn"
                type="button"
                onClick={() => setEntryToDelete(selectedEntry)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 focus:outline-hidden focus:ring-2 focus:ring-rose-300"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete entry</span>
              </button>
            </div>
          </div>

          {/* Entry Title & Metadata */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                {formatTimestamp(selectedEntry.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 font-medium text-slate-600">
                <Shield className="h-3 w-3 text-slate-500" />
                AI Policy: {selectedEntry.aiProcessing === 'never' ? 'Private (AI excluded)' : 'Standard'}
              </span>
            </div>

            <h2 className="mt-3 font-serif text-2xl font-semibold text-slate-900">
              {selectedEntry.title}
            </h2>

            {selectedEntry.summary && (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                  Reflection Summary
                </span>
                <p className="mt-1 text-sm leading-relaxed text-slate-700">
                  {selectedEntry.summary}
                </p>
              </div>
            )}
          </div>

          {/* Conversation Transcript */}
          <div className="mt-8 space-y-4">
            <h3 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Full Reflection Transcript ({selectedEntry.messages.length} {selectedEntry.messages.length === 1 ? 'message' : 'messages'})
            </h3>

            {selectedEntry.messages.map((msg, i) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id || i}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="mb-1 flex items-center justify-between w-full max-w-[90%] px-1 text-[11px] font-medium text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <span>{isUser ? 'You' : 'ThoughtKeep'}</span>
                      <span>•</span>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <CopyMessageButton
                      textToCopy={msg.content}
                      isUserMessage={isUser}
                      messageElementId={`history-msg-bubble-${msg.id || i}`}
                    />
                  </div>
                  <div
                    id={`history-msg-bubble-${msg.id || i}`}
                    className={`max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed select-text cursor-text ${
                      isUser
                        ? 'bg-slate-900 text-slate-50 shadow-xs selection:bg-slate-700 selection:text-white'
                        : 'border border-slate-200 bg-white text-slate-800 shadow-2xs selection:bg-slate-200 selection:text-slate-900'
                    }`}
                  >
                    <div className="whitespace-pre-wrap font-sans select-text">{msg.content}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          isOpen={!!entryToDelete}
          title="Delete Journal Entry"
          description="Are you sure you want to permanently delete this journal entry? This action cannot be undone."
          confirmLabel="Delete Entry"
          isDestructive={true}
          isProcessing={isDeleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => !isDeleting && setEntryToDelete(null)}
        />
      </div>
    );
  }

  // Main History List View
  return (
    <div id="history-view-container" className="h-full overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Header & Search */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
          <div>
            <h1 className="font-serif text-2xl font-semibold text-slate-900">
              Journal History
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Your past reflections stored securely under your private profile.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="search-entries-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reflections..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-hidden focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Error notification */}
        {errorMessage && (
          <div
            id="history-error-banner"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-center justify-between"
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-700 text-base leading-none font-bold"
            >
              &times;
            </button>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="py-16 text-center text-sm text-slate-500">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
            Loading your journal entries...
          </div>
        )}

        {/* Empty State */}
        {!isLoading && entries.length === 0 && (
          <div id="empty-history-state" className="py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
              <BookOpen className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-serif text-lg font-medium text-slate-900">
              No entries saved yet
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Reflect on your day in the journal and save your entry to build your private archive.
            </p>
            <button
              id="start-first-journal-btn"
              type="button"
              onClick={onStartNewJournal}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-900"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Start a reflection</span>
            </button>
          </div>
        )}

        {/* No Search Matches */}
        {!isLoading && entries.length > 0 && filteredEntries.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-500">
            No entries found matching &ldquo;{searchQuery}&rdquo;.
          </div>
        )}

        {/* Entries List (Newest first) */}
        {!isLoading && filteredEntries.length > 0 && (
          <div id="entries-list-grid" className="mt-6 space-y-4">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                id={`journal-entry-card-${entry.id}`}
                className="group relative rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs transition-all hover:border-slate-300 hover:shadow-xs"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {formatTimestamp(entry.createdAt)}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        <MessageSquare className="h-3 w-3" />
                        {entry.messages.length} {entry.messages.length === 1 ? 'msg' : 'msgs'}
                      </span>
                      <button
                        id={`delete-entry-btn-${entry.id}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEntryToDelete(entry);
                        }}
                        className="rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus:outline-hidden focus:ring-2 focus:ring-rose-300"
                        title="Delete entry"
                        aria-label="Delete entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <h3
                    onClick={() => setSelectedEntry(entry)}
                    className="cursor-pointer font-serif text-lg font-semibold text-slate-900 hover:text-slate-700"
                  >
                    {entry.title}
                  </h3>

                  {entry.summary && (
                    <p
                      onClick={() => setSelectedEntry(entry)}
                      className="cursor-pointer text-sm leading-relaxed text-slate-600 line-clamp-2"
                    >
                      {entry.summary}
                    </p>
                  )}

                  <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 border border-slate-200/60">
                      <Shield className="h-2.5 w-2.5 text-slate-400" />
                      {entry.aiProcessing === 'never' ? 'Private' : 'Standard'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedEntry(entry)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-950"
                    >
                      <span>Read reflection</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!entryToDelete}
        title="Delete Journal Entry"
        description="Are you sure you want to permanently delete this journal entry from your storage? This action cannot be reversed."
        confirmLabel="Delete Entry"
        isDestructive={true}
        isProcessing={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => !isDeleting && setEntryToDelete(null)}
      />
    </div>
  );
};
