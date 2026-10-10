const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // Africa/Nairobi is UTC+3, no DST.

// Today's date in Nairobi as YYYY-MM-DD — the day a daily item is sold on.
export function nairobiToday(now: Date = new Date()): string {
  return new Date(now.getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}
