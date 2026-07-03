import { formatDistanceToNow, format, isValid } from 'date-fns';

/**
 * SQLite stores dates as "2026-07-03 10:01:37" (space separator).
 * JS Date constructor needs ISO 8601 "2026-07-03T10:01:37".
 * This normalises both formats safely.
 */
export function parseDate(raw) {
  if (!raw) return null;
  // Already a Date object
  if (raw instanceof Date) return isValid(raw) ? raw : null;
  // Replace space separator with T to ensure ISO 8601 parsing
  const normalised = String(raw).replace(' ', 'T');
  const d = new Date(normalised);
  return isValid(d) ? d : null;
}

/** "3 minutes ago", "2 days ago" etc. Returns "—" on invalid date. */
export function timeAgo(raw) {
  const d = parseDate(raw);
  if (!d) return '—';
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '—';
  }
}

/** "Jul 3, 2026" */
export function shortDate(raw) {
  const d = parseDate(raw);
  if (!d) return '—';
  try {
    return format(d, 'MMM d, yyyy');
  } catch {
    return '—';
  }
}

/** "Jul 3, 2026, 10:01 AM" */
export function fullDateTime(raw) {
  const d = parseDate(raw);
  if (!d) return '—';
  try {
    return format(d, 'MMM d, yyyy, h:mm a');
  } catch {
    return '—';
  }
}

/** "10:01:37 AM" */
export function timeOnly(raw) {
  const d = parseDate(raw);
  if (!d) return '—';
  try {
    return format(d, 'h:mm:ss a');
  } catch {
    return '—';
  }
}

/** Duration in human form: "1m 23s" or "45s" */
export function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
