/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LINGUA — voice input and Google Cloud voice replies.
 *
 * Speech input uses the browser's Web Speech API.
 * Speech output uses authenticated Google Cloud Text-to-Speech
 * through ThoughtKeep's protected server endpoint.
 */

import React, { useEffect, useRef, useState } from 'react';
import { getFreshIdToken } from '../firebase.ts';

interface Props {
  onTranscript: (text: string) => void;
  speakText?: string | null;
  language: string;
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;

  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function VoiceControls({
  onTranscript,
  speakText,
  language,
}: Props) {
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      return localStorage.getItem('thoughtkeep-voice-replies') === 'true';
    } catch {
      return false;
    }
  });

  const [voiceStyle, setVoiceStyle] = useState<'boy' | 'girl'>(() => {
    try {
      return localStorage.getItem('thoughtkeep-voice-style') === 'girl'
        ? 'girl'
        : 'boy';
    } catch {
      return 'boy';
    }
  });

  const [dictationLanguage, setDictationLanguage] = useState(() => {
    try {
      return localStorage.getItem('thoughtkeep-dictation-language') || 'auto';
    } catch {
      return 'auto';
    }
  });

  const recognitionRef =
    useRef<SpeechRecognitionLike | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const lastAutoSpokenTextRef =
    useRef<string | null>(null);

  useEffect(() => {
    const syncVoiceSettings = () => {
      try {
        setVoiceStyle(
          localStorage.getItem('thoughtkeep-voice-style') === 'girl'
            ? 'girl'
            : 'boy'
        );

        setAutoSpeak(
          localStorage.getItem('thoughtkeep-voice-replies') === 'true'
        );

        setDictationLanguage(
          localStorage.getItem('thoughtkeep-dictation-language') || 'auto'
        );
      } catch {
        // Keep current in-memory settings.
      }
    };

    window.addEventListener(
      'thoughtkeep-voice-settings-changed',
      syncVoiceSettings,
    );

    return () => {
      window.removeEventListener(
        'thoughtkeep-voice-settings-changed',
        syncVoiceSettings,
      );
    };
  }, []);

  useEffect(() => {
    setSttSupported(getRecognitionCtor() !== null);

    setTtsSupported(
      typeof window !== 'undefined' &&
      typeof window.Audio === 'function'
    );

    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // already stopped
      }

      try {
        audioRef.current?.pause();
      } catch {
        // already stopped
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const stopAudio = () => {
    try {
      audioRef.current?.pause();

      if (audioRef.current) {
        audioRef.current.currentTime = 0;
      }
    } catch {
      // already stopped
    }

    setSpeaking(false);
    setVoiceLoading(false);
  };

  const startListening = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    setNotice(null);

    try {
      const rec = new Ctor();

      const selectedDictationLanguage =
        dictationLanguage && dictationLanguage !== 'auto'
          ? dictationLanguage
          : language && language !== 'auto'
            ? language
            : (navigator.language || 'en-US');

      rec.lang = selectedDictationLanguage;

      rec.continuous = false;
      rec.interimResults = false;

      rec.onresult = (e: any) => {
        const transcript =
          e?.results?.[0]?.[0]?.transcript;

        if (
          typeof transcript === 'string' &&
          transcript.trim()
        ) {
          onTranscript(transcript.trim());
        }
      };

      rec.onerror = (e: any) => {
        setListening(false);

        setNotice(
          e?.error === 'not-allowed' ||
          e?.error === 'service-not-allowed'
            ? 'Microphone access was not allowed. You can still type your reflection.'
            : 'We could not hear that clearly. Please try again, or type instead.'
        );
      };

      rec.onend = () => setListening(false);

      recognitionRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
      setNotice(
        'Voice input is unavailable in this browser. You can still type.'
      );
    }
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }

    setListening(false);
  };

  const speak = async (text: string = speakText || '') => {
    if (!ttsSupported || !text.trim()) return;

    setNotice(null);
    stopAudio();
    setVoiceLoading(true);

    try {
      const token = await getFreshIdToken();

      if (!token) {
        throw new Error('Your session has expired.');
      }

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          text,
          voiceStyle,
          language,
        }),
      });

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      const audioBlob = await response.blob();
      const objectUrl = URL.createObjectURL(audioBlob);

      objectUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setSpeaking(false);
        setVoiceLoading(false);

        if (objectUrlRef.current === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrlRef.current = null;
        }

        audioRef.current = null;
      };

      audio.onerror = () => {
        setSpeaking(false);
        setVoiceLoading(false);

        if (objectUrlRef.current === objectUrl) {
          URL.revokeObjectURL(objectUrl);
          objectUrlRef.current = null;
        }

        audioRef.current = null;

        setNotice(
          'Voice playback failed. You can still read the response.'
        );
      };

      setVoiceLoading(false);

      /*
       * Browsers may reject script-initiated audio playback even after
       * the user has interacted with the page. Keep the generated audio
       * available so the user can explicitly press "Play voice".
       */
      try {
        await audio.play();
        setSpeaking(true);
        setNotice(null);
      } catch (error: any) {
        setSpeaking(false);

        if (error?.name === 'NotAllowedError') {
          setNotice(
            'Tap "Play voice" to hear this response.'
          );
        } else {
          setNotice(
            'Voice playback could not start. Tap "Play voice" to try again.'
          );
        }
      }
    } catch {
      setVoiceLoading(false);
      setSpeaking(false);

      setNotice(
        'Voice playback is temporarily unavailable. You can still read the response.'
      );
    }
  };

  const stopSpeaking = () => {
    stopAudio();
  };

  useEffect(() => {
    try {
      localStorage.setItem(
        'thoughtkeep-voice-replies',
        String(autoSpeak)
      );

      localStorage.setItem(
        'thoughtkeep-voice-style',
        voiceStyle
      );
    } catch {
      // Settings still work for the current session.
    }

    if (!autoSpeak) {
      lastAutoSpokenTextRef.current = null;
    }
  }, [autoSpeak, voiceStyle]);

  useEffect(() => {
    if (!autoSpeak || !speakText || !ttsSupported) {
      return;
    }

    if (
      lastAutoSpokenTextRef.current === speakText
    ) {
      return;
    }

    lastAutoSpokenTextRef.current = speakText;

    const timer = window.setTimeout(() => {
      void speak(speakText);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [speakText, autoSpeak, ttsSupported]);

  if (!sttSupported && !ttsSupported) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {ttsSupported && (
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <button
            type="button"
            onClick={() =>
              setAutoSpeak((value) => !value)
            }
            aria-pressed={autoSpeak}
            className={`rounded-full border px-3 py-1.5 font-medium transition ${
              autoSpeak
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            🔊 Voice replies: {autoSpeak ? 'On' : 'Off'}
          </button>

          <label className="flex items-center gap-1.5">
            <span>Voice</span>

            <select
              value={voiceStyle}
              onChange={(e) =>
                setVoiceStyle(
                  e.target.value as 'boy' | 'girl'
                )
              }
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
              aria-label="Voice type"
            >
              <option value="girl">
                👩 Girl voice
              </option>
              <option value="boy">
                👨 Boy voice
              </option>
            </select>
          </label>
        </div>
      )}

      <div className="flex items-center gap-2">
        {sttSupported && (
          <button
            type="button"
            onClick={
              listening
                ? stopListening
                : startListening
            }
            aria-label={
              listening
                ? 'Stop dictation'
                : 'Dictate your reflection'
            }
            aria-pressed={listening}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 ${
              listening
                ? 'border-rose-300 bg-rose-50 text-rose-700'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {listening ? '⏹' : '🎤'}
            {listening
              ? 'Listening - tap to stop'
              : 'Speak'}
          </button>
        )}

        {ttsSupported && speakText && (
          <button
            type="button"
            onClick={
              speaking
                ? stopSpeaking
                : voiceLoading
                  ? undefined
                  : () => void speak(speakText)
            }
            aria-label={
              speaking
                ? 'Stop voice playback'
                : 'Play the last reflection aloud'
            }
            aria-pressed={speaking}
            disabled={voiceLoading}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-1 disabled:opacity-60"
          >
            {voiceLoading
              ? '⏳'
              : speaking
                ? '⏹'
                : '▶'}

            {voiceLoading
              ? 'Preparing voice...'
              : speaking
                ? 'Stop'
                : 'Play voice'}
          </button>
        )}
      </div>

      {notice && (
        <p
          role="status"
          className="text-xs text-slate-500"
        >
          {notice}
        </p>
      )}
    </div>
  );
}

export const LANGUAGE_OPTIONS: Array<{
  code: string;
  label: string;
}> = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'hi-IN', label: 'हिन्दी Hindi' },
  { code: 'gu-IN', label: 'ગુજરાતી Gujarati' },
  { code: 'mr-IN', label: 'मराठी Marathi' },
  { code: 'bn-IN', label: 'বাংলা Bengali' },
  { code: 'ta-IN', label: 'தமிழ் Tamil' },
  { code: 'te-IN', label: 'తెలుగు Telugu' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ Kannada' },
  { code: 'ml-IN', label: 'മലയാളം Malayalam' },
  { code: 'pa-IN', label: 'ਪੰਜਾਬੀ Punjabi' },
  { code: 'ur-IN', label: 'اردو Urdu' },
  { code: 'ja-JP', label: '日本語 Japanese' },
  { code: 'ko-KR', label: '한국어 Korean' },
  { code: 'zh-CN', label: '中文 Chinese' },
  { code: 'id-ID', label: 'Bahasa Indonesia' },
  { code: 'th-TH', label: 'ไทย Thai' },
  { code: 'vi-VN', label: 'Tiếng Việt' },
  { code: 'fil-PH', label: 'Filipino' },
];
