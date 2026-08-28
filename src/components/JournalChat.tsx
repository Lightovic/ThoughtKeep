/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  BookmarkCheck,
  RotateCcw,
  Sparkles,
  AlertCircle,
  MessageSquare,
  CloudSun,
} from 'lucide-react';
import type { ChatMessage, JournalEntry } from '../types.ts';
import { getFreshIdToken, saveJournalEntry } from '../firebase.ts';
import { ConfirmationModal } from './ConfirmationModal.tsx';
import { CopyMessageButton } from './CopyMessageButton.tsx';
import { isExplicitWeatherRequest } from '../utils/weatherIntent.ts';

interface JournalChatProps {
  userId: string;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  preventAiProcessing: boolean;
  setPreventAiProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  onEntrySaved: (entry: JournalEntry) => void;
}

const STARTER_PROMPTS = [
  'What was the most meaningful moment of your day?',
  "What's been occupying your mind lately?",
  'What went well today, and what would you like to carry forward?',
];

export const JournalChat: React.FC<JournalChatProps> = ({
  userId,
  messages,
  setMessages,
  inputText,
  setInputText,
  preventAiProcessing,
  setPreventAiProcessing,
  onEntrySaved,
}) => {
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamText, setCurrentStreamText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

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

  /**
   * Executes the chat streaming turn
   */
  const executeChatTurn = async (textToSend: string) => {
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

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 25000); // 25-second client-side timeout

    try {
      // Get fresh verified token
      const token = await getFreshIdToken();
      if (!token) {
        throw new Error('Your session has expired or is invalid. Please sign in again.');
      }

      // Check if this is an explicit weather question and request location consent on demand
      let coords: { latitude: number; longitude: number } | null = null;
      if (isExplicitWeatherRequest(textToSend)) {
        if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
          try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                timeout: 7000,
                maximumAge: 60000,
                enableHighAccuracy: false,
              });
            });
            if (pos && pos.coords) {
              coords = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              };
            }
          } catch (_geoErr) {
            // Geolocation was denied or unavailable; proceed gracefully
          }
        }
      }

      // Convert messages to history payload
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
        aiProcessing: m.aiProcessing || 'allowed',
      }));

      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const clientLocale = navigator.language || 'en-US';

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        signal: abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          history: historyPayload,
          message: textToSend,
          timezone: clientTimezone,
          locale: clientLocale,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        }),
      });

      if (!response.ok) {
        let errData: any = null;
        try {
          errData = await response.json();
        } catch {
          // JSON parsing failed
        }
        const errorMsg =
          errData?.error && typeof errData.error === 'string'
            ? errData.error
            : 'We were unable to connect to the reflection assistant right now. Please try again.';
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response stream is unavailable. Please try again.');

      const decoder = new TextDecoder();
      let accumulatedText = '';
      let buffer = '';
      let serverReportedError: string | null = null;

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

          let parsed: any = null;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }

          if (parsed && typeof parsed === 'object') {
            if (parsed.error && typeof parsed.error === 'string') {
              serverReportedError = parsed.error;
              break;
            }
            if (parsed.text && typeof parsed.text === 'string') {
              accumulatedText += parsed.text;
              setCurrentStreamText(accumulatedText);
            }
          }
        }

        if (serverReportedError) {
          break;
        }
      }

      if (serverReportedError) {
        throw new Error(serverReportedError);
      }

      if (!accumulatedText.trim()) {
        throw new Error('The reflection assistant did not produce a response. Please try sending your thought again.');
      }

      const modelMessage: ChatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        role: 'model',
        content: accumulatedText.trim(),
        timestamp: new Date().toISOString(),
        aiProcessing: 'allowed',
      };
      setMessages((prev) => [...prev, modelMessage]);
    } catch (err: any) {
      let friendlyError = 'We could not complete this reflection turn. Please try again in a moment.';
      if (err.name === 'AbortError') {
        friendlyError = 'The request took too long to respond. Please check your connection and try again.';
      } else if (err.message && typeof err.message === 'string') {
        friendlyError = err.message;
      }
      setErrorMessage(friendlyError);
    } finally {
      clearTimeout(timeoutId);
      setIsStreaming(false);
      setCurrentStreamText('');
    }
  };

  /**
   * Main entry point when user triggers a message send
   */
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = inputText.trim();
    if (!textToSend || isStreaming) return;

    setErrorMessage(null);
    await executeChatTurn(textToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  /**
   * Consequential Action: Explicit Save Entry Flow
   */
  const handleConfirmSave = async () => {
    if (messages.length === 0 || isSaving) return;
    setIsSaving(true);
    setErrorMessage(null);

    const chosenPolicy: 'allowed' | 'never' = preventAiProcessing ? 'never' : 'allowed';

    try {
      const token = await getFreshIdToken();
      if (!token) {
        throw new Error('Your session has expired or is invalid. Please sign in again.');
      }

      let summaryData = {
        title: chosenPolicy === 'never' ? 'Private Reflection' : 'Daily Reflection',
        summary: chosenPolicy === 'never' ? 'Private journal reflection saved without AI processing.' : '',
      };

      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const clientLocale = navigator.language || 'en-US';

      // Request server-side summarization ONLY if allowed
      if (chosenPolicy === 'allowed') {
        try {
          const summarizeRes = await fetch('/api/chat/summarize', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
                aiProcessing: 'allowed',
              })),
              aiProcessing: 'allowed',
              timezone: clientTimezone,
              locale: clientLocale,
            }),
          });

          if (summarizeRes.ok) {
            summaryData = await summarizeRes.json();
          }
        } catch {
          // Fallback to default summary data if summarization request fails
        }
      }

      const updatedMessages: ChatMessage[] = messages.map((m) => ({
        ...m,
        aiProcessing: chosenPolicy,
      }));

      // Save directly to Firestore owner-bound collection
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
      setInputText('');
      setIsSaveModalOpen(false);
      setPreventAiProcessing(false);
      onEntrySaved(savedEntryObj);
    } catch (_err: any) {
      setErrorMessage(
        'Your entry could not be saved right now. Your conversation is still here — please try again.'
      );
      setIsSaveModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmReset = () => {
    setMessages([]);
    setInputText('');
    setPreventAiProcessing(false);
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
          const bubbleId = `msg-bubble-${msg.id}`;
          return (
            <div
              key={msg.id}
              id={`message-turn-${msg.id}`}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className="mb-1 flex items-center justify-between w-full max-w-[85%] sm:max-w-[75%] px-1 text-[11px] font-medium text-slate-400 select-none"
              >
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
                {/* Copy message action */}
                <CopyMessageButton
                  textToCopy={msg.content}
                  isUserMessage={isUser}
                  messageElementId={bubbleId}
                />
              </div>
              <div
                id={bubbleId}
                className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 text-sm leading-relaxed select-text cursor-text ${
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

        {/* Ongoing Live Streaming Output */}
        {isStreaming && (
          <div className="flex flex-col items-start">
            <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium text-slate-400">
              <span>ThoughtKeep</span>
              <span>•</span>
              <span className="animate-pulse text-slate-600">Reflecting...</span>
            </div>
            <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 shadow-2xs select-text cursor-text selection:bg-slate-200 selection:text-slate-900">
              {currentStreamText ? (
                <div className="whitespace-pre-wrap font-sans select-text">{currentStreamText}</div>
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

      {/* Human Confirmation: Save Entry Modal */}
      <ConfirmationModal
        isOpen={isSaveModalOpen}
        title="Save Journal Entry"
        description="Saving this conversation will permanently store the session in your private Firestore database under your account."
        confirmLabel={preventAiProcessing ? 'Save Private Entry' : 'Generate Summary & Save'}
        isProcessing={isSaving}
        onConfirm={handleConfirmSave}
        onCancel={() => !isSaving && setIsSaveModalOpen(false)}
      >
        <div className="space-y-3">
          {/* Privacy Control */}
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
              <li>Stored in private user-owned entries</li>
              <li>Database rules enforce owner-only read and write</li>
              <li>Policy: <span className="font-semibold text-slate-800">{preventAiProcessing ? 'never (AI excluded)' : 'allowed'}</span></li>
            </ul>
          </div>
        </div>
      </ConfirmationModal>

      {/* Human Confirmation: Discard/Reset Modal */}
      <ConfirmationModal
        isOpen={isResetModalOpen}
        title="Start Fresh Reflection"
        description="Are you sure you want to clear your current unsaved reflection turns and start a fresh session?"
        confirmLabel="Start Fresh"
        isDestructive={true}
        onConfirm={handleConfirmReset}
        onCancel={() => setIsResetModalOpen(false)}
      />
    </div>
  );
};
