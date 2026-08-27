/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Send, BookmarkCheck, RotateCcw, Sparkles, AlertCircle, MessageSquare } from 'lucide-react';
import type { ChatMessage, JournalEntry } from '../types.ts';
import { getFreshIdToken, saveJournalEntry } from '../firebase.ts';
import { ConfirmationModal } from './ConfirmationModal.tsx';

interface JournalChatProps {
  userId: string;
  onEntrySaved: (entry: JournalEntry) => void;
}

const STARTER_PROMPTS = [
  'What made you feel proud or accomplished today?',
  'Describe a problem you have been turning over in your mind.',
  'What is one small thing that brought you peace today?',
];

export const JournalChat: React.FC<JournalChatProps> = ({ userId, onEntrySaved }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamText, setCurrentStreamText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [preventAiProcessing, setPreventAiProcessing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom as messages or stream chunks arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamText, isStreaming]);

  // Adjust textarea height dynamically
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  const handleSelectStarterPrompt = (prompt: string) => {
    setInputText(prompt);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = inputText.trim();
    if (!textToSend || isStreaming) return;

    setErrorMessage(null);
    const userMessageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newTurn: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toISOString(),
      aiProcessing: 'allowed',
    };

    const updatedHistory = [...messages, newTurn];
    setMessages(updatedHistory);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setIsStreaming(true);
    setCurrentStreamText('');

    try {
      // Get fresh verified token (Directive 2)
      const token = await getFreshIdToken();
      if (!token) {
        throw new Error('Authentication session is no longer active. Please sign in again.');
      }

      // Convert messages to history payload
      const historyPayload = messages.map(m => ({
        role: m.role,
        content: m.content,
        aiProcessing: m.aiProcessing || 'allowed',
      }));

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          history: historyPayload,
          message: textToSend,
        }),
      });

      if (!response.ok) {
        let errData;
        try {
          errData = await response.json();
        } catch {
          errData = { error: 'Failed to contact AI reflection service.' };
        }
        throw new Error(errData.error || 'Server rejected the reflection request.');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response stream unavailable.');

      const decoder = new TextDecoder();
      let accumulatedText = '';
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.text) {
              accumulatedText += parsed.text;
              setCurrentStreamText(accumulatedText);
            }
          } catch (pErr: any) {
            if (pErr.message && pErr.message !== 'Unexpected token') {
              console.warn('Stream parse error:', pErr);
            }
          }
        }
      }

      if (accumulatedText.trim()) {
        const modelMessage: ChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          role: 'model',
          content: accumulatedText.trim(),
          timestamp: new Date().toISOString(),
          aiProcessing: 'allowed',
        };
        setMessages((prev) => [...prev, modelMessage]);
      }
    } catch (err: any) {
      setErrorMessage(
        err.message || 'We could not complete this reflection turn. Please try again in a moment.'
      );
    } finally {
      setIsStreaming(false);
      setCurrentStreamText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /**
   * Consequential Action: Explicit Save Entry Flow
   * Directives 8, 2, 3, 14 (Task H3):
   * 1. Confirms action with human preview and privacy control.
   * 2. Server summarizes via Gemini only if aiProcessing is 'allowed'.
   * 3. Stores in Firestore under users/{uid}/entries/{entryId} with chosen aiProcessing value.
   */
  const handleConfirmSave = async () => {
    if (messages.length === 0 || isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);

    const chosenPolicy: 'allowed' | 'never' = preventAiProcessing ? 'never' : 'allowed';

    try {
      const token = await getFreshIdToken();
      if (!token) throw new Error('Your session expired. Please sign in again.');

      let summaryData = {
        title: chosenPolicy === 'never' ? 'Private Reflection' : 'Daily Reflection',
        summary: chosenPolicy === 'never' ? 'Private journal reflection saved without AI processing.' : '',
      };

      // 1. Request server-side summarization ONLY if allowed
      if (chosenPolicy === 'allowed') {
        const summarizeRes = await fetch('/api/chat/summarize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: messages.map(m => ({
              role: m.role,
              content: m.content,
              aiProcessing: 'allowed',
            })),
            aiProcessing: 'allowed',
          }),
        });

        if (summarizeRes.ok) {
          summaryData = await summarizeRes.json();
        }
      }

      const updatedMessages: ChatMessage[] = messages.map(m => ({
        ...m,
        aiProcessing: chosenPolicy,
      }));

      // 2. Save directly to Firestore owner-bound collection
      const newEntryId = await saveJournalEntry(userId, {
        title: summaryData.title || (chosenPolicy === 'never' ? 'Private Reflection' : 'Daily Reflection'),
        summary: summaryData.summary || (chosenPolicy === 'never' ? 'Private journal reflection saved without AI processing.' : 'A saved reflection session.'),
        messages: updatedMessages,
        aiProcessing: chosenPolicy,
      });

      const savedEntryObj: JournalEntry = {
        id: newEntryId,
        userId,
        title: summaryData.title || (chosenPolicy === 'never' ? 'Private Reflection' : 'Daily Reflection'),
        summary: summaryData.summary || (chosenPolicy === 'never' ? 'Private journal reflection saved without AI processing.' : 'A saved reflection session.'),
        messages: updatedMessages,
        aiProcessing: chosenPolicy,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Reset local conversation and notify parent
      setMessages([]);
      setIsSaveModalOpen(false);
      setPreventAiProcessing(false);
      onEntrySaved(savedEntryObj);
    } catch (err: any) {
      setErrorMessage(
        err.message || 'We could not save your journal entry. Your active text is preserved below.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmReset = () => {
    setMessages([]);
    setInputText('');
    setErrorMessage(null);
    setCurrentStreamText('');
    setIsResetModalOpen(false);
  };

  return (
    <div id="journal-chat-container" className="flex h-full flex-col">
      {/* Header bar with controls */}
      <div className="flex items-center justify-between border-b border-slate-200/80 bg-white/60 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-slate-500" />
          <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            Active Reflection
          </span>
          {messages.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 font-medium">
              {messages.length} {messages.length === 1 ? 'turn' : 'turns'}
            </span>
          )}
        </div>

        {messages.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              id="reset-journal-btn"
              type="button"
              onClick={() => setIsResetModalOpen(true)}
              disabled={isStreaming}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
              title="Start a fresh conversation"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Start Fresh</span>
            </button>
            <button
              id="save-entry-btn"
              type="button"
              onClick={() => setIsSaveModalOpen(true)}
              disabled={isStreaming}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-slate-800 focus:outline-hidden focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
            >
              <BookmarkCheck className="h-3.5 w-3.5" />
              <span>Save entry</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Message Stream Area */}
      <div
        id="journal-messages-viewport"
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6"
      >
        {/* Error notification */}
        {errorMessage && (
          <div
            id="chat-error-banner"
            className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
            role="alert"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <div className="flex-1">
              <p className="font-medium">Notice</p>
              <p className="mt-0.5 text-rose-700">{errorMessage}</p>
            </div>
            <button
              id="dismiss-chat-error-btn"
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-700"
            >
              &times;
            </button>
          </div>
        )}

        {/* Empty State: First-time / New conversation */}
        {messages.length === 0 && !isStreaming && (
          <div id="journal-empty-state" className="mx-auto max-w-xl py-8 text-center sm:py-12">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-800 ring-1 ring-slate-200">
              <Sparkles className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-serif text-xl font-medium text-slate-900 sm:text-2xl">
              Welcome to ThoughtKeep
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              This is your private space to reflect, untangle a problem, or capture impressions of
              your day. Write freely. Gemini will listen and respond thoughtfully.
            </p>

            <div className="mt-8 text-left">
              <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
                Choose a reflection prompt to start
              </span>
              <div className="mt-3 flex flex-col gap-2.5">
                {STARTER_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    id={`starter-prompt-btn-${idx}`}
                    type="button"
                    onClick={() => handleSelectStarterPrompt(prompt)}
                    className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3.5 text-left text-sm text-slate-700 shadow-2xs transition-all hover:border-slate-400 hover:bg-slate-50/70"
                  >
                    <span>{prompt}</span>
                    <Send className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-700" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Conversation Turn Messages */}
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium text-slate-400">
                <span>{isUser ? 'You' : 'ThoughtKeep'}</span>
                <span>•</span>
                <span>
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <div
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-slate-900 text-slate-50 shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-800 shadow-2xs'
                }`}
              >
                {/* Directive 5: Text-only rendering, no executable HTML or scripts */}
                <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
              </div>
            </div>
          );
        })}

        {/* Ongoing Live Streaming Output */}
        {isStreaming && (
          <div className="flex flex-col items-start">
            <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium text-slate-400">
              <span>ThoughtKeep</span>
              <span>•</span>
              <span className="animate-pulse text-slate-600">Reflecting...</span>
            </div>
            <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 shadow-2xs">
              {currentStreamText ? (
                <div className="whitespace-pre-wrap font-sans">{currentStreamText}</div>
              ) : (
                <div className="flex items-center gap-2 py-1 text-slate-400 text-xs">
                  <span className="h-2 w-2 animate-ping rounded-full bg-slate-400" />
                  Formulating thoughtful response...
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Form */}
      <div className="border-t border-slate-200 bg-white p-4 sm:px-6">
        <form onSubmit={handleSendMessage} className="mx-auto max-w-4xl">
          <div className="relative flex items-end rounded-2xl border border-slate-300 bg-white shadow-2xs focus-within:border-slate-900 focus-within:ring-1 focus-within:ring-slate-900">
            <textarea
              ref={textareaRef}
              id="journal-input-textarea"
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Write your thoughts, reflections, or questions..."
              disabled={isStreaming}
              className="w-full resize-none bg-transparent px-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden disabled:opacity-50"
            />
            <div className="p-2">
              <button
                id="send-message-btn"
                type="submit"
                disabled={!inputText.trim() || isStreaming}
                aria-label="Send message"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-xs transition-all hover:bg-slate-800 focus:outline-hidden disabled:opacity-40 disabled:hover:bg-slate-900"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-400">
            <span>Press Enter to send, Shift + Enter for new line</span>
            <span>{inputText.length} characters</span>
          </div>
        </form>
      </div>

      {/* Human Confirmation: Save Entry Modal (Directive 8 & Task H3) */}
      <ConfirmationModal
        isOpen={isSaveModalOpen}
        title="Save Journal Entry"
        description="Saving this conversation will permanently store the session in your private Firestore database under your user account."
        confirmLabel={preventAiProcessing ? "Save Private Entry" : "Generate Summary & Save"}
        isProcessing={isSaving}
        onConfirm={handleConfirmSave}
        onCancel={() => !isSaving && setIsSaveModalOpen(false)}
      >
        <div className="space-y-3">
          {/* Privacy Control (Task H3) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                id="prevent-ai-checkbox"
                type="checkbox"
                checked={preventAiProcessing}
                onChange={(e) => setPreventAiProcessing(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <div className="flex-1">
                <span className="text-xs font-semibold text-slate-900">
                  Never send this entry to AI
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Saves this reflection with strict privacy, excluding it from future AI reflections, context expansion, and automated summaries.
                </p>
              </div>
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">Storage preview:</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[11px]">
              <li>{messages.length} turns in this reflection session</li>
              <li>Stored under <code className="font-mono text-slate-700">users/{userId.substring(0, 8)}.../entries/</code></li>
              <li>Database rules enforce owner-only read and write</li>
              <li>Policy: <span className="font-semibold text-slate-800">{preventAiProcessing ? 'never (AI excluded)' : 'allowed'}</span></li>
            </ul>
          </div>
        </div>
      </ConfirmationModal>

      {/* Human Confirmation: Discard/Reset Modal (Directive 8) */}
      <ConfirmationModal
        isOpen={isResetModalOpen}
        title="Start Fresh Reflection"
        description="Are you sure you want to discard the active un-saved conversation turns and start a fresh reflection?"
        confirmLabel="Discard & Start Fresh"
        isDestructive={true}
        onConfirm={handleConfirmReset}
        onCancel={() => setIsResetModalOpen(false)}
      />
    </div>
  );
};
