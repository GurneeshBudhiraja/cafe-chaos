/**
 * Today's forecast for the Canadian café (docs/CANADA-CHALLENGES.md, the
 * reason to come back): picked from the player's local date, so it needs
 * no save and changes at midnight. Each week holds each forecast its
 * `days` (game/rules.ts FORECASTS): three sunny days, two cold snaps and
 * two snow days, in an order that shifts week to week.
 */

import { FORECASTS, type Forecast, type ForecastId } from './rules.js';

/** One week's days, before the shift. */
const WEEK: ForecastId[] = (Object.keys(FORECASTS) as ForecastId[]).flatMap((id) => Array.from({ length: FORECASTS[id].days }, () => id));

/** Days since 1 Jan 1970 in the local time zone. */
function localDay(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

/**
 * The forecast for `date` (today by default). Days run through the week
 * three slots at a time (3 and 7 share no factor, so every seven days in a
 * row visit all seven slots once), and each week starts one slot further
 * on, so the same weekday does not always have the same weather.
 */
export function forecastFor(date: Date = new Date()): Forecast {
  const day = localDay(date);
  const week = Math.floor(day / WEEK.length);
  const slot = (day * 3 + week) % WEEK.length;
  return FORECASTS[WEEK[(slot + WEEK.length) % WEEK.length]];
}
