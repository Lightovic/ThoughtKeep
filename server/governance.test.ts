/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Governance + tool suggestion control tests (directive 11).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRetention, computeExpiresAt, retentionLabel } from './governance.js';
import { suggestTools, ALLOWED_TOOL_URLS } from './toolSuggestions.js';

describe('Retention policy', () => {
  it('POSITIVE: the three offered periods are accepted', () => {
    for (const r of ['7d', '30d', '365d'] as const) {
      assert.equal(normalizeRetention(r), r);
    }
  });

  it('NEGATIVE: anything unrecognised falls back to keeping the entry', () => {
    for (const bad of [null, undefined, '', 'never', '1d', 0, {}, '30 days']) {
      assert.equal(normalizeRetention(bad as unknown), 'forever',
        'an unknown retention value must never shorten the life of an entry');
    }
  });

  it('"forever" produces NO expiry field, which is how Firestore disables TTL', () => {
    assert.equal(computeExpiresAt('forever'), null);
  });

  it('computes the expiry the correct number of days ahead', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    assert.equal(computeExpiresAt('7d', from)!.toDate().toISOString().slice(0, 10), '2026-01-08');
    assert.equal(computeExpiresAt('30d', from)!.toDate().toISOString().slice(0, 10), '2026-01-31');
    assert.equal(computeExpiresAt('365d', from)!.toDate().toISOString().slice(0, 10), '2027-01-01');
  });

  it('labels say "about", matching what Firestore actually guarantees', () => {
    // Firestore deletes within 24 hours of expiry, not at the instant.
    // Claiming precision we do not have would be a false security claim.
    for (const r of ['7d', '30d', '365d'] as const) {
      assert.match(retentionLabel(r), /about/i);
    }
  });
});

describe('Tool suggestions', () => {
  it('POSITIVE: a clear writing intent suggests Docs', () => {
    const s = suggestTools('I need to draft my dissertation introduction tonight');
    assert.ok(s.some((x) => x.id === 'docs'));
    assert.ok(s[0].reason.length > 0, 'every suggestion must explain itself');
  });

  it('POSITIVE: a deadline suggests Calendar', () => {
    assert.ok(suggestTools('the deadline is next Friday and I am nervous').some((x) => x.id === 'calendar'));
  });

  it('NEGATIVE: an ordinary reflection suggests nothing', () => {
    assert.deepEqual(suggestTools('Today felt heavy and I am not sure why.'), []);
    assert.deepEqual(suggestTools(''), []);
  });

  it('never returns more than two suggestions', () => {
    const s = suggestTools('I must draft a report before the deadline for my trip and make a to-do list');
    assert.ok(s.length <= 2, 'a reply must not become an advert');
  });

  it('SECURITY: every URL comes from the fixed allowlist', () => {
    const probes = [
      'draft a report about http://evil.example.com/steal',
      'my trip to <script>alert(1)</script>',
      'deadline ?redirect=https://phishing.example',
      'write a letter javascript:alert(document.cookie)',
    ];
    for (const p of probes) {
      for (const s of suggestTools(p)) {
        assert.ok(ALLOWED_TOOL_URLS.includes(s.url),
          `suggestion URL must come from the allowlist, got: ${s.url}`);
        assert.match(s.url, /^https:\/\//, 'suggestions must always be https');
      }
    }
  });

  it('SECURITY: no user text is ever interpolated into a suggestion URL', () => {
    const marker = 'UNIQUEMARKERXYZ';
    for (const s of suggestTools(`I want to write about ${marker} before the deadline`)) {
      assert.equal(s.url.includes(marker), false, 'user content must never reach a URL');
    }
  });
});
