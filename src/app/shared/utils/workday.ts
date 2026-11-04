// Date helpers working on local 'YYYY-MM-DD' strings. Weekends are skipped,
// so the "yesterday" of a Monday standup is the previous Friday.

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function isWorkday(value: string): boolean {
  const day = parseIsoDate(value).getDay();
  return day !== 0 && day !== 6;
}

/** Moves by `count` workdays (negative goes back in time). */
export function addWorkdays(value: string, count: number): string {
  const date = parseIsoDate(value);
  const step = count < 0 ? -1 : 1;
  let remaining = Math.abs(count);
  while (remaining > 0) {
    date.setDate(date.getDate() + step);
    if (isWorkday(toIsoDate(date))) remaining--;
  }
  return toIsoDate(date);
}

/** Calendar days from `value` ('YYYY-MM-DD', or a timestamp starting with it) to `today`. */
export function daysAgo(value: string, today = toIsoDate(new Date())): number {
  // Rounded, so a daylight-saving hour doesn't make a day count as 0.96.
  return Math.round((parseIsoDate(today).getTime() - parseIsoDate(value.slice(0, 10)).getTime()) / 86_400_000);
}

/** 'today', 'yesterday', '3 days ago', or '12 Oct' when older than a week. */
export function relativeDay(value: string, today = toIsoDate(new Date())): string {
  const days = daysAgo(value, today);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return parseIsoDate(value.slice(0, 10)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Today if it is a workday, otherwise the last workday before it. */
export function latestWorkday(today = new Date()): string {
  const value = toIsoDate(today);
  return isWorkday(value) ? value : addWorkdays(value, -1);
}
