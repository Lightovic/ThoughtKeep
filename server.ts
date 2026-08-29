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
import { readProfile, writeProfile, buildCompanionGuidance } from './server/profile.js';
import { exportUserData, eraseUserData, normalizeRetention, computeExpiresAt } from './server/governance.js';
import { suggestTools } from './server/toolSuggestions.js';
import { synthesizeSpeech, type VoiceStyle } from './server/tts.js';
import { checkQuota, recordUsage, recordBlock, estimateTokens } from './server/quota.js';
import { isOwner, readWatchtowerMetrics, updateLimits } from './server/watchtower.js';

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
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ];
    res.setHeader('Content-Security-Policy', cspDirectives.join('; '));

    next();
  });

  // Protected Google Cloud Text-to-Speech endpoint.
  // Google credentials remain server-side; the browser receives only audio.
  app.post('/api/tts', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { text, voiceStyle } = req.body || {};

    if (typeof text !== 'string' || !text.trim()) {
      res.status(400).json({
        error: 'No text was provided for voice playback.',
      });
      return;
    }

    if (text.length > 8000) {
      res.status(400).json({
        error: 'The voice response is too long to play.',
      });
      return;
    }

    if (voiceStyle !== 'girl' && voiceStyle !== 'boy') {
      res.status(400).json({
        error: 'Invalid voice selection.',
      });
      return;
    }

    const style: VoiceStyle = voiceStyle;

    try {
      const audio = await synthesizeSpeech(text, style);

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(audio);
    } catch (_err) {
      res.status(500).json({
        error: 'Voice playback is temporarily unavailable. You can still read the response or try again.',
      });
    }
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

    // COST CONTROL: both daily limits are checked before Gemini is called.
    const quota = await checkQuota(user.uid);
    if (!quota.allowed) {
      void recordLedgerEvent(user.uid, {
        action: 'QUOTA_EXCEEDED', decision: 'BLOCKED',
        category: quota.reason === 'PER_USER_LIMIT' ? 'daily allowance' : 'demo capacity',
        severity: 'LOW',
      });
      res.status(429).json({
        error: quota.reason === 'PER_USER_LIMIT'
          ? 'You have used your reflections for today. Your allowance resets at midnight IST. Your journal and history are unaffected.'
          : 'ThoughtKeep has reached its shared daily capacity for this demo. Sign-in and your history still work, and new reflections resume at midnight IST.',
      });
      return;
    }

    // Set headers for SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      const companionProfile = await readProfile(user.uid);
      const stream = streamJournalChat(
        user.uid,
        history as ChatTurn[],
        message.trim(),
        processingPolicy,
        timezone,
        locale,
        resolvedWeather,
        buildCompanionGuidance(companionProfile.role)
      );
      let emittedChars = 0;
      for await (const chunk of stream) {
        emittedChars += chunk.length;
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }

      // Count the message against both daily counters and the Watchtower series.
      void recordUsage(user.uid, estimateTokens(message) + Math.ceil(emittedChars / 4));
      // THE LEDGER: the reflection passed both gates.
      void recordLedgerEvent(user.uid, {
        action: 'RESPONSE_SCREENED',
        decision: 'ALLOWED',
        category: 'reflection',
        severity: 'LOW',
      });
      // Suggestions are derived from the USER's own message, never the model's
      // reply, and every URL is a fixed constant from a small allowlist.
      const toolSuggestions = suggestTools(message.trim());
      if (toolSuggestions.length > 0) {
        res.write(`data: ${JSON.stringify({ suggestions: toolSuggestions })}\n\n`);
      }
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
        void recordBlock(gerr.category);
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

    // GOVERNANCE: an explicit retention choice becomes a Firestore TTL field.
    // "forever" writes NO field, which is how Firestore disables TTL per document.
    const retention = normalizeRetention((req.body || {}).retention);
    const expiresAt = computeExpiresAt(retention);
    const entryDocWithPolicy: Record<string, unknown> = { ...entryDoc, retention };
    if (expiresAt) entryDocWithPolicy.expiresAt = expiresAt;

    try {
      const firestore = getAdminFirestore();
      await firestore
        .collection('users')
        .doc(user.uid)
        .collection('entries')
        .doc(entryId)
        .set(entryDocWithPolicy);

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

  /**
   * THE WATCHTOWER — owner only.
   * A non-owner receives a plain 404. We do not return 403, because 403
   * confirms the route exists; "not found" reveals nothing at all.
   */
  app.get('/api/watchtower', requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!isOwner(req.user!.uid)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      res.json(await readWatchtowerMetrics());
    } catch {
      res.status(500).json({ error: 'Unable to load metrics right now.' });
    }
  });

  app.post('/api/watchtower/limits', requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!isOwner(req.user!.uid)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      const { perUserDailyLimit, appWideDailyLimit } = req.body || {};
      await updateLimits(perUserDailyLimit, appWideDailyLimit);
      res.json(await readWatchtowerMetrics());
    } catch {
      res.status(500).json({ error: 'Unable to update limits right now.' });
    }
  });

  /**
   * THE COMPANION — the user's own optional role description.
   * Owner-bound by construction: the uid comes from the verified token, so
   * there is no parameter with which to request someone else's profile.
   */
  app.get('/api/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
    res.json(await readProfile(req.user!.uid));
  });

  app.post('/api/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      // writeProfile sanitises; an instruction-like or malformed role is
      // stored as null rather than rejected loudly, so the user is never
      // taught which strings the filter dislikes.
      res.json(await writeProfile(req.user!.uid, (req.body || {}).role));
    } catch {
      res.status(500).json({ error: 'Unable to save that right now. Please try again.' });
    }
  });

  /**
   * PORTABILITY - everything we hold about this user, on demand.
   * The uid comes from the verified token, so nobody can export anyone else.
   */
  app.get('/api/export', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      res.json(await exportUserData(req.user!.uid));
    } catch {
      res.status(500).json({ error: 'Unable to prepare your export right now.' });
    }
  });

  /**
   * ERASURE - permanently delete everything this user owns.
   * Irreversible, so it is a DELETE on an explicit endpoint and the interface
   * requires the user to type DELETE first (directive 8: the AI proposes, the
   * user decides, the system enforces).
   */
  app.delete('/api/account', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    try {
      const result = await eraseUserData(user.uid);
      logSecurityEvent({
        action: 'ACCOUNT_ERASED',
        resourceId: `user:${user.uid.substring(0, 6)}...`,
        decision: 'ALLOW',
        policy: 'USER_INITIATED_ERASURE',
        severity: 'INFO',
        details: { reason: 'USER_REQUESTED' },
      });
      res.json({ success: true, documentsDeleted: result.deleted });
    } catch {
      res.status(500).json({ error: 'Unable to complete deletion right now. Nothing was deleted.' });
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
