import type { PortalOffers } from '@rampflow/shared/modules/booking/api.portal';
import { addDays, type LocalDate, siteDay, type TimeZone } from '@rampflow/shared/time';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { type OfferRequest, portalOffersQuery } from './queries';
import type { PickerDay } from './slot-picker';

// The seven-day strip of the slot picker: one availability request per day, so a day shows how
// many starts it offers and a chosen day's chips are already loaded.

const WEEK = 7;

export interface DayStrip {
  days: PickerDay[];
  offersOn: (date: LocalDate | null) => PortalOffers | undefined;
  /** Moves the strip a week back, not before the site's today; `undefined` on the first week. */
  previous?: () => void;
  /** Moves the strip a week ahead, not past the carrier horizon. */
  next?: () => void;
}

export function useDayStrip(
  orgId: string,
  request: Omit<OfferRequest, 'date'> | null,
  site: { timeZone: string; horizonDays: number } | undefined,
  around: LocalDate | null,
): DayStrip {
  const today = site ? siteDay(new Date(), site.timeZone as TimeZone) : null;
  const last = today && site ? addDays(today, site.horizonDays) : null;
  const weekOf = (d: LocalDate | null) => {
    if (!today || !d || d <= today) return 0;
    return Math.floor((Date.parse(d) - Date.parse(today)) / (WEEK * 86_400_000));
  };
  const [week, setWeek] = useState(() => weekOf(around));
  const first = today ? addDays(today, week * WEEK) : null;
  const dates = first
    ? Array.from({ length: WEEK }, (_, i) => addDays(first, i)).filter((d) => !last || d <= last)
    : [];
  const results = useQueries({
    queries: dates.map((date) => ({
      ...portalOffersQuery(orgId, { ...(request as OfferRequest), date }),
      enabled: request !== null,
    })),
  });
  const byDate = new Map(dates.map((d, i) => [d, results[i]?.data]));
  return {
    days: dates.map((date) => ({ date, count: byDate.get(date)?.starts.length })),
    offersOn: (date) => (date ? byDate.get(date) : undefined),
    previous: week > 0 ? () => setWeek(week - 1) : undefined,
    next: last && first && addDays(first, WEEK) <= last ? () => setWeek(week + 1) : undefined,
  };
}
