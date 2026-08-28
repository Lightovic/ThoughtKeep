/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * THE GATE — Google Cloud Model Armor integration.
 *
 * Every message entering the model and every reply leaving it passes through
 * here. This is the single place where content is judged.
 *
 * Directive 10 (fail closed): if Model Armor is unreachable, times out, or
 * answers in a shape we do not recognise, we BLOCK. A screening layer that
 * lets content through when it breaks is not a screening layer.
 *
 * Directive 9: only a general category is ever returned for logging. The
 * matched rule, the raw response and the offending text never leave here.
 */

const PROJECT_ID = process.env.MODEL_ARMOR_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'true-rampart-464602-i0';

/**
 * Model Armor lives in us-central1 while the rest of ThoughtKeep runs in
 * asia-southeast1. The template was created there because asia-south1 did
 * not offer the full filter set (notably Malicious URI). We accept the
 * cross-region latency in exchange for complete filter coverage, and mask
 * it in the UI with a "Screening..." indicator.
 * Recorded in docs/trade-offs.md.
 */
const LOCATION = process.env.MODEL_ARMOR_LOCATION || 'us-central1';
const TEMPLATE_ID = process.env.MODEL_ARMOR_TEMPLATE || 'thoughtkeep-gate';

/** Hard ceiling on a single screening call. Exceeding it blocks. */
const SCREEN_TIMEOUT_MS = 6000;

/** Set MODEL_ARMOR_ENABLED=false only for local development without ADC. */
const GATE_ENABLED = process.env.MODEL_ARMOR_ENABLED !== 'false';

export type GateCategory =
  | 'prompt injection'
  | 'harmful content'
  | 'sensitive data'
  | 'malicious link'
  | 'prohibited content'
  | 'unscreened content';

export interface GateVerdict {
  allowed: boolean;
  category: GateCategory | null;
}

/** Raised when The Gate blocks. Carries a category only — never content. */
export class GateBlockedError extends Error {
  readonly category: GateCategory;
  readonly direction: 'inbound' | 'outbound';
  constructor(category: GateCategory, direction: 'inbound' | 'outbound') {
    super(`GATE_BLOCKED_${direction.toUpperCase()}`);
    this.name = 'GateBlockedError';
    this.category = category;
    this.direction = direction;
  }
}

/* ------------------------------------------------------------------ */
/* Access token from the Cloud Run metadata server                     */
/* ------------------------------------------------------------------ */
/*
 * No key file, no credential in source (directive 4). Cloud Run exposes the
 * attached service account's token on the metadata server. We cache it and
 * refresh a minute before expiry.
 */
let cachedToken: { value: string; expiresAtMs: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return cachedToken.value;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' }, signal: controller.signal },
    );
    if (!res.ok) throw new Error('METADATA_TOKEN_UNAVAILABLE');
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('METADATA_TOKEN_MALFORMED');
    cachedToken = {
      value: body.access_token,
      expiresAtMs: now + (body.expires_in ?? 3600) * 1000,
    };
    return cachedToken.value;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Category mapping                                                    */
/* ------------------------------------------------------------------ */
/*
 * Model Armor names its filters in filterResults. We translate those keys
 * into plain language a journaling user can understand. We deliberately do
 * NOT surface sub-scores, confidence levels or which rule fired — that is a
 * tuning guide for an attacker (directive 9).
 */
const FILTER_TO_CATEGORY: Record<string, GateCategory> = {
  pi_and_jailbreak: 'prompt injection',
  rai: 'harmful content',
  sdp: 'sensitive data',
  malicious_uris: 'malicious link',
  csam: 'prohibited content',
};

function extractCategory(filterResults: unknown): GateCategory {
  if (filterResults && typeof filterResults === 'object') {
    for (const [key, result] of Object.entries(filterResults as Record<string, any>)) {
      const inner = result && typeof result === 'object' ? Object.values(result)[0] : null;
      const matchState = (inner as any)?.matchState;
      if (matchState === 'MATCH_FOUND') {
        return FILTER_TO_CATEGORY[key] ?? 'harmful content';
      }
    }
  }
  return 'harmful content';
}

/* ------------------------------------------------------------------ */
/* The screening call                                                  */
/* ------------------------------------------------------------------ */

async function callModelArmor(
  text: string,
  kind: 'prompt' | 'response',
): Promise<GateVerdict> {
  if (!GATE_ENABLED) {
    // Explicitly disabled for local dev. Never silently "allowed" —
    // the caller records this as unscreened so nothing can claim
    // the content passed The Gate when The Gate did not run.
    return { allowed: true, category: 'unscreened content' };
  }

  const verb = kind === 'prompt' ? 'sanitizeUserPrompt' : 'sanitizeModelResponse';
  const url =
    `https://modelarmor.${LOCATION}.rep.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/locations/${LOCATION}/templates/${TEMPLATE_ID}:${verb}`;

  const body =
    kind === 'prompt'
      ? { userPromptData: { text } }
      : { modelResponseData: { text } };

  const token = await getAccessToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCREEN_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) throw new Error('MODEL_ARMOR_HTTP_ERROR');

    const json = (await res.json()) as any;
    const result = json?.sanitizationResult;

    // An unrecognised shape is treated exactly like a failure.
    if (!result || typeof result.filterMatchState !== 'string') {
      throw new Error('MODEL_ARMOR_MALFORMED_RESPONSE');
    }

    // Model Armor ran but could not complete its own evaluation.
    if (result.invocationResult && result.invocationResult !== 'SUCCESS') {
      throw new Error('MODEL_ARMOR_INVOCATION_INCOMPLETE');
    }

    if (result.filterMatchState === 'MATCH_FOUND') {
      return { allowed: false, category: extractCategory(result.filterResults) };
    }

    return { allowed: true, category: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Screen a user prompt before it reaches Gemini.
 * Throws GateBlockedError if the content must not proceed.
 */
export async function gateInbound(text: string): Promise<GateCategory | null> {
  let verdict: GateVerdict;
  try {
    verdict = await callModelArmor(text, 'prompt');
  } catch {
    // Directive 10: unreachable, slow or malformed => deny.
    throw new GateBlockedError('unscreened content', 'inbound');
  }
  if (!verdict.allowed) {
    throw new GateBlockedError(verdict.category ?? 'harmful content', 'inbound');
  }
  return verdict.category;
}

/**
 * Screen a model reply before it reaches the user or storage.
 * Throws GateBlockedError if the reply must not be shown.
 */
export async function gateOutbound(text: string): Promise<GateCategory | null> {
  let verdict: GateVerdict;
  try {
    verdict = await callModelArmor(text, 'response');
  } catch {
    throw new GateBlockedError('unscreened content', 'outbound');
  }
  if (!verdict.allowed) {
    throw new GateBlockedError(verdict.category ?? 'sensitive data', 'outbound');
  }
  return verdict.category;
}

export const GATE_CONFIG = { PROJECT_ID, LOCATION, TEMPLATE_ID, GATE_ENABLED };
