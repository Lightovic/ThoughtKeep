/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveUserDateTimeContext } from './datetime.js';
import { constructJournalSystemInstruction } from './gemini.js';

test('DateTime Context Resolution Suite', async (t) => {
  await t.test('Valid IANA timezone resolves with local time format and correct day of week', () => {
    const ctx = resolveUserDateTimeContext('America/New_York', 'en-US');
    assert.equal(ctx.timezone, 'America/New_York');
    assert.equal(ctx.isUtcFallback, false);
    assert.ok(typeof ctx.formattedDateTime === 'string' && ctx.formattedDateTime.length > 5);
    assert.ok(typeof ctx.dayOfWeek === 'string' && ctx.dayOfWeek.length > 0);
  });

  await t.test('Invalid or malicious timezone string falls back safely to UTC without throwing', () => {
    const invalidInputs = [
      'Invalid/Timezone',
      '../../../etc/passwd',
      'UTC; DROP TABLE users;',
      '<script>alert(1)</script>',
      12345,
      null,
      undefined,
      '',
      '   ',
    ];

    for (const input of invalidInputs) {
      const ctx = resolveUserDateTimeContext(input, 'en-US');
      assert.equal(ctx.timezone, 'UTC');
      assert.equal(ctx.isUtcFallback, true);
      assert.ok(ctx.formattedDateTime.includes('UTC'));
    }
  });

  await t.test('System instruction correctly embeds validated timezone context', () => {
    const localCtx = resolveUserDateTimeContext('Europe/London', 'en-GB');
    const instruction = constructJournalSystemInstruction(localCtx);
    assert.ok(instruction.includes('ThoughtKeep'));
    assert.ok(instruction.includes('Europe/London'));
    assert.ok(instruction.includes(localCtx.dayOfWeek));
  });

  await t.test('System instruction correctly embeds UTC fallback note when timezone is unknown', () => {
    const fallbackCtx = resolveUserDateTimeContext('NotATimezone');
    const instruction = constructJournalSystemInstruction(fallbackCtx);
    assert.ok(instruction.includes('ThoughtKeep'));
    assert.ok(instruction.includes('UTC'));
  });
});
