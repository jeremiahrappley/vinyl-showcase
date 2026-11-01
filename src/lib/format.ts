// Formatting helpers that follow the Aperture content rules:
// money as $1,234.56 with a true minus (−), dates as "Oct 31, 2026",
// sentence-case counts.

const MINUS = "−";

export function formatMoney(value: number, currency = "USD"): string {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  return value < 0 ? `${MINUS}${formatted}` : formatted;
}

/** Compact currency for chart axis ticks: $3.6k, $12k, $1.2M. */
export function formatMoneyCompact(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  })
    .format(value)
    .replace("K", "k");
}

/** "Oct 31, 2026". Date-only strings (YYYY-MM-DD) are read as calendar dates, not shifted by time zone. */
export function formatDate(value: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  });
}

/** "Oct 31" for chart x ticks. */
export function formatShortDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/** Text color that stays readable on an arbitrary cover-palette swatch. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#0a0a0a";
  const n = parseInt(m[1], 16);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  // Compare contrast against near-black and near-white and pick the stronger.
  const onDark = (lum + 0.05) / 0.05;
  const onLight = 1.05 / (lum + 0.05);
  return onDark >= onLight ? "#0a0a0a" : "#f2f2f2";
}
