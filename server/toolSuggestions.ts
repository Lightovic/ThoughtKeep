/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TOOL SUGGESTIONS — small, honest pointers to a Google tool when the
 * conversation clearly implies one.
 *
 * SECURITY NOTE, and the reason this file is so boring:
 * every URL below is a FIXED CONSTANT. Nothing the user wrote is ever
 * interpolated into a link, appended as a query parameter, or used to choose
 * a destination outside this list. A suggestion feature that builds URLs from
 * conversation text is an open redirect waiting to happen, and on a page that
 * renders model output it is also a way to smuggle a link past the reader's
 * judgement. So the model never chooses a URL; matching only selects one of
 * these four.
 *
 * The reason string explains the trigger to the user, because a suggestion
 * you cannot explain is just surveillance with a friendly face.
 */

export interface ToolSuggestion {
  id: string;
  label: string;
  url: string;
  reason: string;
}

interface Rule {
  id: string;
  label: string;
  url: string;
  reason: string;
  pattern: RegExp;
}

const RULES: Rule[] = [
  {
    id: 'docs',
    label: 'Start a Google Doc',
    url: 'https://docs.new',
    reason: 'You mentioned writing or drafting something.',
    pattern: /\b(write|writing|draft|drafting|essay|report|article|letter|proposal|resume|cv|blog\s?post|dissertation|thesis)\b/i,
  },
  {
    id: 'calendar',
    label: 'Add to Google Calendar',
    url: 'https://calendar.google.com/calendar/u/0/r/eventedit',
    reason: 'You mentioned a date, a deadline or something to remember.',
    pattern: /\b(deadline|due\s+(on|by|date)|appointment|meeting|interview|exam\s+on|remind me|schedule|book(ing)?\s+a|next\s+(week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
  },
  {
    id: 'maps',
    label: 'Open Google Maps',
    url: 'https://www.google.com/maps',
    reason: 'You mentioned travelling or going somewhere.',
    pattern: /\b(trip|travel(ling|ing)?|journey|flight|train|directions|commute|visit(ing)?\s+\w+|holiday|vacation|route)\b/i,
  },
  {
    id: 'keep',
    label: 'Open Google Keep',
    url: 'https://keep.google.com',
    reason: 'You mentioned a list or something to keep track of.',
    pattern: /\b(to-?do|todo|checklist|shopping list|make a list|groceries|packing list|reminder note)\b/i,
  },
];

/**
 * At most TWO suggestions, so the reply never turns into an advert.
 * Matching runs on the USER's own message only, never on the model's reply:
 * suggestions must follow from what the person actually said, and a model
 * that could summon links by mentioning a keyword would be a way to steer
 * the user somewhere.
 */
export function suggestTools(userMessage: string): ToolSuggestion[] {
  if (typeof userMessage !== 'string' || userMessage.length === 0) return [];
  const text = userMessage.slice(0, 4000);

  const hits: ToolSuggestion[] = [];
  for (const r of RULES) {
    if (r.pattern.test(text)) {
      hits.push({ id: r.id, label: r.label, url: r.url, reason: r.reason });
    }
    if (hits.length === 2) break;
  }
  return hits;
}

/** The allowlist, exported so a test can assert nothing else ever appears. */
export const ALLOWED_TOOL_URLS = RULES.map((r) => r.url);
