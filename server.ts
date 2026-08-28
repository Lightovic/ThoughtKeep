/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { requireAuth, getAdminFirestore, type AuthenticatedRequest } from './server/auth.js';
import { streamJournalChat, generateEntrySummary, type ChatTurn } from './server/gemini.js';
import { GateBlockedError } from './server/screening.js';
import { fetchCurrentWeather, validateCoordinates, type WeatherData } from './server/weather.js';
import { logSecurityEvent } from './server/logger.js';
import { recordLedgerEvent, readLedger } from './server/ledger.js';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Strict payload size limits (Directives 1 & 15)
  app.use(express.json({ limit: '256kb' }));

  // Security Headers Middleware (Directives 1 & M2)
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self)');

    // Restrictive Content-Security-Policy (Task M2)
    // Permitting only self, Firebase Auth / Firestore endpoints, and Google fonts/avatars
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://apis.google.com https://*.firebaseapp.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https://lh3.googleusercontent.com https://*.googleusercontent.com",
      "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://*.googleapis.com https://*.firebaseio.com https://api.open-meteo.com",
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ];
    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

    next();
  });

  // Operational health endpoint (Task C3: operational facts only, no security marketing claims)
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'thoughtkeep',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * Protected Weather Endpoint (Issue 2)
   * - Requires verified Google-signed-in user
   * - Validates numeric coordinates strictly
   * - Fetches live weather from Open-Meteo
   * - Never persists or logs coordinates
   */
  app.post('/api/weather', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const { latitude, longitude } = req.body || {};

    const coords = validateCoordinates(latitude, longitude);
    if (!coords) {
      res.status(400).json({ error: "We couldn't determine your location right now. Please try again." });
      return;
    }

    try {
      const weather = await fetchCurrentWeather(user.uid, coords.latitude, coords.longitude);
      res.json(weather);
    } catch (_err) {
      res.status(500).json({ error: "We couldn't get the current weather right now. Please try again." });
    }
  });

  /**
   * Protected Streaming Chat Endpoint
   * - Requires verified Firebase ID token with email_verified = true
   * - Enforces server-derived UID
   * - Accepts optional weather context or coordinates
   * - Buffers and screens model responses before progressive emission (Task C1 & H2)
   */
  app.post('/api/chat/stream', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const {
      history = [],
      message,
      aiProcessing = 'allowed',
      timezone,
      locale,
      weather,
      latitude,
      longitude,
    } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({ error: 'Please write a message to reflect on.' });
      return;
    }

    if (!Array.isArray(history)) {
      res.status(400).json({ error: 'Invalid history format.' });
      return;
    }

    const processingPolicy: 'allowed' | 'never' = aiProcessing === 'never' ? 'never' : 'allowed';

    // Optional weather resolution
    let resolvedWeather: WeatherData | null = weather || null;
    if (!resolvedWeather && typeof latitude === 'number' && typeof longitude === 'number') {
      const coords = validateCoordinates(latitude, longitude);
      if (coords) {
        try {
          resolvedWeather = await fetchCurrentWeather(user.uid, coords.latitude, coords.longitude);
        } catch {
          // Weather fetch failed gracefully; continue without blocking reflection
        }
      }
    }

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      const stream = streamJournalChat(
        user.uid,
        history as ChatTurn[],
        message.trim(),
        processingPolicy,
        timezone,
        locale,
        resolvedWeather
      );
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }
      // THE LEDGER: the reflection passed both gates.
      void recordLedgerEvent(user.uid, {
        action: 'RESPONSE_SCREENED',
        decision: 'ALLOWED',
        category: 'reflection',
        severity: 'LOW',
      });
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err: any) {
      const isConfigError = err?.code === 'CONFIG_MISSING_API_KEY' || err?.name === 'ConfigurationError';
      const isGateBlock = err instanceof GateBlockedError;

      // THE GATE: tell the user the general category, that nothing was sent
      // or stored, and what to do next. Never reveal which rule matched
      // (directive 9) and never echo an internal error message.
      let userErrorMessage: string;
      if (isGateBlock) {
        const cat = (err as GateBlockedError).category;
        userErrorMessage =
          cat === 'unscreened content'
            ? 'ThoughtKeep could not complete its safety check just now, so this message was not sent to the AI and nothing was saved. Please try again in a moment.'
            : (err as GateBlockedError).direction === 'inbound'
              ? `This message was flagged as possible ${cat}, so it was not sent to the AI and nothing was stored. You can rephrase it and try again.`
              : `The reply was withheld because it was flagged as possible ${cat}. Nothing was shown or saved. You can rephrase your message and try again.`;
      } else if (isConfigError) {
        userErrorMessage =
          'The reflection assistant is currently unavailable due to a service configuration issue. Please check back later.';
      } else {
        // Directive 16: never surface a raw internal error to the user.
        userErrorMessage = 'We were unable to process this reflection right now. Please try again.';
      }

      logSecurityEvent({
        action: 'CHAT_STREAM_ERROR',
        resourceId: `user:${user.uid.substring(0, 6)}...`,
        decision: 'DENY',
        policy: 'FAIL_CLOSED',
        severity: 'ERROR',
        details: isGateBlock
          ? { reason: 'GATE_BLOCKED', category: (err as GateBlockedError).category }
          : { reason: isConfigError ? 'MISSING_API_KEY' : 'CHAT_STREAM_FAILED' },
      });

      // THE LEDGER: record the block. Category only, never content.
      if (isGateBlock) {
        const gerr = err as GateBlockedError;
        void recordLedgerEvent(user.uid, {
          action: gerr.category === 'sensitive data' ? 'SENSITIVE_DATA_DETECTED' : 'CONTENT_BLOCKED',
          decision: 'BLOCKED',
          category: gerr.category,
          severity: gerr.category === 'unscreened content' ? 'MEDIUM' : 'HIGH',
        });
      }

      // If headers were already sent, send a sanitized error event and end
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: userErrorMessage })}\n\n`);
        res.end();
      } else {
        res.status(500).json({
          error: userErrorMessage,
        });
      }
    }
  });

  /**
   * Protected Summarization Endpoint
   * - Triggered ONLY when the user explicitly clicks "Save entry"
   * - Generates concise title and summary from the journal session
   * - Respects entry-level aiProcessing policy (Task C2)
   */
  app.post('/api/chat/summarize', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const { messages = [], aiProcessing = 'allowed', timezone, locale } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'No messages provided for summarization.' });
      return;
    }

    const processingPolicy: 'allowed' | 'never' = aiProcessing === 'never' ? 'never' : 'allowed';

    try {
      const summaryResult = await generateEntrySummary(
        user.uid,
        messages as ChatTurn[],
        processingPolicy,
        timezone,
        locale
      );
      res.json(summaryResult);
    } catch (err: any) {
      const isConfigError = err?.code === 'CONFIG_MISSING_API_KEY' || err?.name === 'ConfigurationError';
      const userErrorMessage = isConfigError
        ? 'The reflection assistant is currently unavailable due to a service configuration issue. Your entry has still been preserved.'
        : 'Unable to generate summary. Your entry will still be preserved.';

      logSecurityEvent({
        action: 'SUMMARIZE_ERROR',
        resourceId: `user:${user.uid.substring(0, 6)}...`,
        decision: 'DENY',
        policy: 'FAIL_CLOSED',
        severity: 'ERROR',
        details: {
          reason: isConfigError ? 'MISSING_API_KEY' : 'SUMMARIZATION_FAILED',
        },
      });
      res.status(500).json({
        error: userErrorMessage,
      });
    }
  });

  /**
   * Protected Entries Endpoints (Issue 1)
   * - Strict owner-bound path: users/{uid}/entries/{entryId}
   * - Enforces verified user UID
   */
  app.get('/api/entries', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    try {
      const firestore = getAdminFirestore();
      const entriesSnapshot = await firestore
        .collection('users')
        .doc(user.uid)
        .collection('entries')
        .orderBy('createdAt', 'desc')
        .get();

      const entries = entriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      res.json({ entries });
    } catch (_err) {
      res.status(500).json({ error: 'Unable to load your entries at this time.' });
    }
  });

  app.post('/api/entries', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const { title, summary, messages = [], aiProcessing = 'allowed' } = req.body || {};

    const entryId = `entry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowUtc = new Date().toISOString();

    const cleanMessages = (Array.isArray(messages) ? messages : []).map((m: any) => ({
      id: m.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      role: m.role === 'model' ? 'model' : 'user',
      content: typeof m.content === 'string' ? m.content : '',
      timestamp: m.timestamp || nowUtc,
      aiProcessing: m.aiProcessing === 'never' ? 'never' : 'allowed',
    }));

    const entryDoc = {
      id: entryId,
      userId: user.uid,
      title: typeof title === 'string' && title.trim() ? title.trim() : (aiProcessing === 'never' ? 'Private Reflection' : 'Daily Reflection'),
      summary: typeof summary === 'string' ? summary.trim() : '',
      messages: cleanMessages,
      aiProcessing: aiProcessing === 'never' ? 'never' : 'allowed',
      createdAt: nowUtc,
      updatedAt: nowUtc,
    };

    try {
      const firestore = getAdminFirestore();
      await firestore
        .collection('users')
        .doc(user.uid)
        .collection('entries')
        .doc(entryId)
        .set(entryDoc);

      res.json({ success: true, id: entryId, entry: entryDoc });
    } catch (_err) {
      res.status(500).json({ error: 'Failed to save entry.' });
    }
  });

  app.delete('/api/entries/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const entryId = req.params.id;

    if (!entryId || typeof entryId !== 'string') {
      res.status(400).json({ error: 'Invalid entry ID.' });
      return;
    }

    try {
      const firestore = getAdminFirestore();
      await firestore
        .collection('users')
        .doc(user.uid)
        .collection('entries')
        .doc(entryId)
        .delete();

      res.json({ success: true });
    } catch (_err) {
      res.status(500).json({ error: 'Failed to delete entry.' });
    }
  });

  /**
   * THE LEDGER — this user's own security audit trail.
   * The uid comes from the verified token only; there is no way to ask for
   * another user's events because there is no parameter to ask with.
   */
  app.get('/api/security/events', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    try {
      const events = await readLedger(user.uid, 100);
      res.json({ events });
    } catch {
      res.status(500).json({ error: 'Unable to load your security events right now.' });
    }
  });

  // Vite development middleware or static production serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ThoughtKeep server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
