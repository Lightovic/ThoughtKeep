/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { logSecurityEvent } from './logger.js';

export interface WeatherData {
  temperatureC: number;
  temperatureF: number;
  condition: string;
  humidity: number;
  windSpeedKmh: number;
  windSpeedMph: number;
  provider: 'Open-Meteo';
  retrievedAt: string;
}

const WMO_CODE_MAP: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

/**
 * Validates untrusted geographic coordinates.
 * Rules:
 * - Must be finite numbers
 * - Latitude: -90 to +90
 * - Longitude: -180 to +180
 */
export function validateCoordinates(lat: unknown, lon: unknown): { latitude: number; longitude: number } | null {
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;
  return { latitude: lat, longitude: lon };
}

/**
 * Fetches current weather from Open-Meteo.
 * PRIVACY RULES:
 * - Coordinates are never persisted in any database
 * - Coordinates are never included in log messages or security events
 * - Timeout is strictly enforced (5 seconds)
 */
export async function fetchCurrentWeather(
  userId: string,
  latitude: number,
  longitude: number
): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ThoughtKeep-Journal/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Open-Meteo responded with status ${response.status}`);
    }

    const data: any = await response.json();
    const current = data.current;
    if (!current || typeof current.temperature_2m !== 'number') {
      throw new Error('Malformed Open-Meteo response format');
    }

    const tempC = Math.round(current.temperature_2m * 10) / 10;
    const tempF = Math.round(((tempC * 9) / 5 + 32) * 10) / 10;
    const weatherCode = typeof current.weather_code === 'number' ? current.weather_code : 0;
    const condition = WMO_CODE_MAP[weatherCode] || 'Clear';
    const humidity = typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : 50;
    const windKmh = Math.round((current.wind_speed_10m || 0) * 10) / 10;
    const windMph = Math.round((windKmh * 0.621371) * 10) / 10;

    logSecurityEvent({
      action: 'WEATHER_FETCH_SUCCESS',
      resourceId: `user:${userId.substring(0, 6)}...`,
      decision: 'ALLOW',
      policy: 'TRANSIENT_WEATHER_QUERY',
      severity: 'INFO',
      details: {
        provider: 'Open-Meteo',
      },
    });

    return {
      temperatureC: tempC,
      temperatureF: tempF,
      condition,
      humidity,
      windSpeedKmh: windKmh,
      windSpeedMph: windMph,
      provider: 'Open-Meteo',
      retrievedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    logSecurityEvent({
      action: 'WEATHER_FETCH_FAILURE',
      resourceId: `user:${userId.substring(0, 6)}...`,
      decision: 'DENY',
      policy: 'TRANSIENT_WEATHER_QUERY',
      severity: 'WARN',
      details: {
        errorType: err.name === 'AbortError' ? 'TIMEOUT' : 'PROVIDER_ERROR',
      },
    });
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
