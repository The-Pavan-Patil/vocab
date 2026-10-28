// "in 45 minutes" / "in 3 hours" / "in 2 days" — when the next review is due,
// for the decks' caught-up screens. Intl does the plurals; the locale is fixed
// to English because it's spliced into English UI copy ("Next review in …").

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always" });

export function formatUntil(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return rtf.format(Math.max(1, mins), "minute");
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return rtf.format(hrs, "hour");
  return rtf.format(Math.round(hrs / 24), "day");
}
