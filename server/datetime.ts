/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server-Authoritative DateTime Resolver (Directive 2 compliance)
 * The server is the sole source of truth for time.
 * Accepts only untrusted timezone/locale strings from the client, validates them,
 * and formats the current date/time on the server. Never accepts timestamps or clock values from the client.
 */

export interface DateTimeContext {
  timezone: string;
  formattedDateTime: string;
  isUtcFallback: boolean;
  dayOfWeek: string;
  dateOnly: string;
  timeOnly: string;
}

export function resolveUserDateTimeContext(
  untrustedTimezone?: unknown,
  untrustedLocale?: unknown
): DateTimeContext {
  let resolvedTz = 'UTC';
  let isUtcFallback = true;

  if (typeof untrustedTimezone === 'string' && untrustedTimezone.trim().length > 0) {
    const candidate = untrustedTimezone.trim();
    try {
      // Validate candidate against standard IANA timezones supported by Intl
      Intl.DateTimeFormat(undefined, { timeZone: candidate });
      resolvedTz = candidate;
      isUtcFallback = candidate.toUpperCase() === 'UTC';
    } catch {
      // Invalid IANA timezone string -> fallback to UTC fail-safe
      resolvedTz = 'UTC';
      isUtcFallback = true;
    }
  }

  const now = new Date();

  // Validate locale string defensively (e.g. "en-US", "en-GB", "fr-FR")
  const localeStr =
    typeof untrustedLocale === 'string' && /^[a-zA-Z0-9-_]{2,20}$/.test(untrustedLocale.trim())
      ? untrustedLocale.trim()
      : 'en-US';

  try {
    const fullFormatter = new Intl.DateTimeFormat(localeStr, {
      timeZone: resolvedTz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    });

    const dayFormatter = new Intl.DateTimeFormat(localeStr, {
      timeZone: resolvedTz,
      weekday: 'long',
    });

    const dateFormatter = new Intl.DateTimeFormat(localeStr, {
      timeZone: resolvedTz,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const timeFormatter = new Intl.DateTimeFormat(localeStr, {
      timeZone: resolvedTz,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    });

    return {
      timezone: resolvedTz,
      formattedDateTime: fullFormatter.format(now),
      isUtcFallback,
      dayOfWeek: dayFormatter.format(now),
      dateOnly: dateFormatter.format(now),
      timeOnly: timeFormatter.format(now),
    };
  } catch {
    // Ultimate fallback to standard ISO / UTC
    return {
      timezone: 'UTC',
      formattedDateTime: now.toUTCString(),
      isUtcFallback: true,
      dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getUTCDay()],
      dateOnly: now.toISOString().split('T')[0],
      timeOnly: now.toTimeString(),
    };
  }
}
