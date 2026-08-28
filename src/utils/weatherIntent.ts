/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Detects whether an incoming user message is an explicit inquiry about current weather.
 * 
 * Rules:
 * - Must NOT trigger on general journal reflections (e.g. "I weathered the storm yesterday", "emotional climate", "climate of fear")
 * - Matches direct questions or requests about local/current weather, temperature, rain, snow, conditions.
 */
export function isExplicitWeatherRequest(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim().toLowerCase();

  // Common direct phrases
  const directPhrases = [
    "what's the weather",
    "what is the weather",
    "how's the weather",
    "how is the weather",
    "weather right now",
    "weather today",
    "weather outside",
    "weather like",
    "weather here",
    "weather in my location",
    "tell me the weather",
    "current weather",
    "local weather",
    "is it raining",
    "is it snowing",
    "is it sunny",
    "what's the temperature",
    "what is the temperature",
    "temperature outside",
    "how hot is it",
    "how cold is it",
    "is it cold outside",
    "is it warm outside",
    "is it hot outside",
  ];

  for (const phrase of directPhrases) {
    if (clean.includes(phrase)) return true;
  }

  // Regex patterns for flexible match
  const weatherRegexes = [
    /\b(weather|temperature|forecast)\b.*\b(today|now|here|outside|currently|my location)\b/i,
    /\b(what|how)\b.*\b(is|are|looks)\b.*\b(the weather|the temperature)\b/i,
    /\b(is it)\s+(raining|snowing|sunny|cloudy|windy|stormy|freezing)\b/i,
  ];

  for (const regex of weatherRegexes) {
    if (regex.test(clean)) return true;
  }

  return false;
}
