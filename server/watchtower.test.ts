/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * THE WATCHTOWER — control tests (directive 11).
 *
 * The most important test here is the last one: a static assertion that the
 * Watchtower source contains no query against the users/ collection. Access
 * control can be re-checked by reading code; the guarantee that the owner
 * CANNOT read journals is only as good as the absence of the query, so we
 * test for that absence directly.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { istDateKey } from './quota.js';
import { isOwner } from './watchtower.js';

describe('Watchtower access control', () => {
  // These tests run with OWNER_UID unset in the environment, which is exactly
  // the unconfigured-deployment case we most need to be safe.
  it('NEGATIVE: with OWNER_UID unset, nobody is the owner (fails closed)', () => {
    assert.equal(process.env.OWNER_UID ?? '', '', 'test env must leave OWNER_UID unset');
    assert.equal(isOwner('srAUriVhkje8Nwh291dmHS10w2V2'), false);
    assert.equal(isOwner('any-other-uid'), false);
  });

  it('NEGATIVE: an empty uid is never the owner', () => {
    assert.equal(isOwner(''), false);
  });
});

describe('Watchtower content isolation — the absolute rule', () => {
  const src = readFileSync(new URL('./watchtower.ts', import.meta.url), 'utf8');

  it("never queries the users/ collection", () => {
    assert.equal(
      /collection\(\s*['"`]users['"`]\s*\)/.test(src),
      false,
      'The Watchtower must never query the users/ collection',
    );
  });

  it('never references journal content fields', () => {
    for (const forbidden of ['entries', 'messages', 'summary', 'content', 'displayName', 'email']) {
      assert.equal(
        new RegExp(`['"\`]${forbidden}['"\`]`).test(src),
        false,
        `The Watchtower must not reference "${forbidden}"`,
      );
    }
  });

  it('reads only the admin metrics documents', () => {
    const collections = [...src.matchAll(/collection\(\s*['"`]([^'"`]+)['"`]\s*\)/g)].map((m) => m[1]);
    for (const c of collections) {
      assert.ok(['admin', 'daily'].includes(c), `unexpected collection read: ${c}`);
    }
  });
});

describe('IST day boundary', () => {
  it('produces a YYYY-MM-DD key on the India calendar day', () => {
    // 2026-08-28T19:00:00Z is 2026-08-29 00:30 IST -> the NEXT Indian day.
    assert.equal(istDateKey(new Date('2026-08-28T19:00:00Z')), '2026-08-29');
    // 2026-08-28T18:00:00Z is 2026-08-28 23:30 IST -> still the same day.
    assert.equal(istDateKey(new Date('2026-08-28T18:00:00Z')), '2026-08-28');
  });
});
