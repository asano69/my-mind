// Pure date/schedule helpers shared by Home.jsx and NoteCard.jsx. Kept
// separate from the UI so they stay trivially unit-testable.

// Matches the naive local "YYYYMMDDTHHMMSS" format produced by converting
// a stored UTC dtstart with utcToLocal (see NoteForm.jsx).
const DTSTART_RE = /^(\d{4})(\d{2})(\d{2})T(\d{6})$/;

// Matches the canonical UTC dtstart/next-occurrence string format
// ("YYYYMMDDTHHMMSSZ"), used here to compute a countdown and to sort by.
const UTC_RE = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/;

// Shifts the date part of a naive local dtstart string by `deltaDays`,
// keeping the time-of-day unchanged. Returns "" if it doesn't match the
// expected format.
export function shiftDtstart(naiveLocal, deltaDays) {
  const match = DTSTART_RE.exec(naiveLocal);
  if (!match) return "";
  const [, y, mo, d, time] = match;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}${mm}${dd}T${time}`;
}

// Replaces the date part of a naive local dtstart string with today's
// local calendar date, keeping the time-of-day unchanged.
export function setDtstartToday(naiveLocal) {
  const match = DTSTART_RE.exec(naiveLocal);
  const time = match ? match[4] : "000000";
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}T${time}`;
}

// Parses a canonical UTC "YYYYMMDDTHHMMSSZ" string into a millisecond
// timestamp, for sorting and countdown math. Returns null if unparsable.
export function parseUtcMs(utcStr) {
  const m = UTC_RE.exec(utcStr ?? "");
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
}

// Formats the time remaining until a canonical UTC "YYYYMMDDTHHMMSSZ"
// string, as "Xd Yh Zm". referenceMs lets callers pass a reactive "now"
// signal so the countdown updates live. Returns "" if utcStr is empty,
// unparsable, or already in the past.
export function formatRemaining(utcStr, referenceMs) {
  const targetMs = parseUtcMs(utcStr);
  if (targetMs === null) return "";

  const diffMs = targetMs - referenceMs;
  if (diffMs <= 0) return "";

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}
