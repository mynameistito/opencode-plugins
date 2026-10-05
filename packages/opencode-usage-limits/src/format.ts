import type { UsageWindow } from "@/types.ts";
import type { BalanceQuota, UsageQuota } from "@/usage.ts";
import { quotaUsedPercent } from "@/usage.ts";

/**
 * Formats a positive duration in seconds into the compact label used by the TUI.
 *
 * Values that are missing, invalid, or already elapsed are displayed as `now`.
 * Positive values are rounded up to the next minute so near-future resets never
 * appear as zero minutes remaining.
 *
 * @param seconds - Duration, in seconds, until the event occurs.
 * @returns A short human-readable duration such as `3m`, `2h 15m`, or `1d 4h`.
 */
const duration = (seconds: number | null): string => {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return "now";
  }

  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) {
    if (remainder === 0) {
      return `${hours}h`;
    }
    if (remainder === 30) {
      return `${hours}.5h`;
    }
    return `${hours}h ${remainder}m`;
  }

  const days = Math.floor(hours / 24);
  const hourRemainder = hours % 24;
  return hourRemainder === 0 ? `${days}d` : `${days}d ${hourRemainder}h`;
};

/**
 * Formats a nullable usage percentage for display.
 *
 * @param value - The percentage to render, or `null` when the provider did not
 *   report a percentage.
 * @returns A rounded usage string, or `? used` when usage is unknown.
 */
const formatPercent = (value: number | null): string =>
  value === null ? "?" : `${Math.round(value)}%`;

const CURRENCY_SYMBOLS = new Map([
  ["CNY", "¥"],
  ["EUR", "€"],
  ["GBP", "£"],
  ["JPY", "¥"],
  ["KRW", "₩"],
  ["USD", "$"],
]);

/**
 * Formats a remaining balance amount without implying a percentage or total.
 *
 * @param quota - The remaining balance to render.
 * @returns A concise amount followed by `remaining`.
 */
const formatBalance = (quota: BalanceQuota): string => {
  const symbol = CURRENCY_SYMBOLS.get(quota.unit.toUpperCase());
  const rounded = symbol ? quota.remaining.toFixed(2) : "";
  const displayAmount =
    symbol && quota.remaining > 0 && Number(rounded) === 0 ? "<0.01" : rounded;
  const amount = symbol
    ? `${symbol}${displayAmount}`
    : `${quota.remaining} ${quota.unit}`;
  return `${amount} remaining`;
};

/** Formats an explicitly-unitized count quota without losing its unit. */
const formatCountQuota = (
  quota: Extract<UsageQuota, { _tag: "Count" }>
): string => {
  const symbol = CURRENCY_SYMBOLS.get(quota.unit?.toUpperCase() ?? "");
  const amount = (value: number): string =>
    symbol ? `${symbol}${value.toFixed(2)}` : `${value} ${quota.unit}`;
  return `${amount(quota.current)} / ${amount(quota.total)} used`;
};

export const formatQuotaText = (
  quota: UsageQuota,
  appendUsedSuffix = false
): string => {
  if (quota._tag === "Balance") {
    return formatBalance(quota);
  }
  if (quota._tag === "Count" && quota.unit) {
    return formatCountQuota(quota);
  }
  const text = formatPercent(quotaUsedPercent(quota));
  return appendUsedSuffix ? `${text} used` : text;
};

/**
 * Builds the primary line of text for a usage window in the sidebar panel.
 *
 * @param window - The provider usage window to summarize.
 * @returns A label and quota summary such as `daily: 42%` or `$12.34 remaining`.
 */
export const windowMainText = (window: UsageWindow): string =>
  `${window.label}: ${formatQuotaText(window.quota)}`;

/**
 * Builds the compact prompt-footer text for the active provider's primary window.
 *
 * @param window - The active provider usage window to summarize.
 * @returns A compact quota label such as `daily 42%` or `$12.34 remaining`.
 */
export const bottomWindowMainText = (window: UsageWindow): string =>
  `${window.label} ${formatQuotaText(window.quota)}`;

/**
 * Formats the reset suffix for a usage window.
 *
 * @param window - The usage window whose reset time should be rendered.
 * @returns A leading-space suffix such as ` resets 12m`, or an empty string when
 *   the provider did not report a reset countdown.
 */
export const windowResetText = (
  window: UsageWindow,
  now: Date = new Date()
): string =>
  window.resetsAt === null
    ? ""
    : ` · ${duration(
        Math.ceil((window.resetsAt.getTime() - now.getTime()) / 1000)
      )}`;

/**
 * Renders a Unicode block progress bar for usage percentage.
 *
 * @param usedPercent - Percentage consumed, or `null` when unknown.
 * @param width - Total width of the bar in characters (default 12).
 * @returns A string of filled (█) and empty (░) blocks.
 */
export const percentBar = (usedPercent: number | null, width = 12): string => {
  if (usedPercent === null) {
    return `[${"░".repeat(width)}]`;
  }
  const ratio = usedPercent / 100;
  let filled = Math.round(ratio * width);
  if (usedPercent > 0 && filled === 0) {
    filled = 1;
  }
  filled = Math.max(0, Math.min(width, filled));
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
};

/**
 * Formats a token count with K/M suffixes.
 *
 * @param count - The token count to format.
 * @returns A formatted string such as `500`, `1.5K`, `15K`, `1.5M`, or `15M`.
 */
export const formatTokenCount = (count: number): string => {
  if (count < 1000) {
    return count.toString();
  }
  if (count < 1_000_000) {
    const thousands = count / 1000;
    return thousands % 1 === 0
      ? `${thousands.toFixed(0)}K`
      : `${thousands.toFixed(1)}K`;
  }
  const millions = count / 1_000_000;
  return millions % 1 === 0
    ? `${millions.toFixed(0)}M`
    : `${millions.toFixed(1)}M`;
};

/**
 * Formats a Date as HH:MM (24-hour, zero-padded).
 *
 * @param date - The date to format.
 * @returns A time string such as `14:32`.
 */
export const formatTimestamp = (date: Date): string => {
  const h = date.getHours().toString().padStart(2, "0");
  const m = date.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
};

/**
 * Formats the absolute reset time for a usage window.
 *
 * @param window - The usage window whose reset time should be rendered.
 * @returns A leading-space suffix such as ` 23:15`, or an empty string when
 *   the provider did not report a reset time.
 */
export const windowResetTime = (window: UsageWindow): string =>
  window.resetsAt === null ? "" : ` ${formatTimestamp(window.resetsAt)}`;

/**
 * Builds a count-based suffix string when the window has both current and total.
 *
 * @param window - The usage window whose counts should be rendered.
 * @returns A suffix such as ` (1.5K/15K)`, or an empty string when counts are missing.
 */
export const tokenCountText = (window: UsageWindow): string => {
  if (window.quota._tag === "Count") {
    return ` (${formatTokenCount(window.quota.current)}/${formatTokenCount(window.quota.total)})`;
  }
  return "";
};

/**
 * Converts a provider-reported rolling-window size into a stable display label.
 *
 * Provider APIs can return slightly imprecise window lengths, so expected
 * windows are matched within a 5% tolerance before falling back to the caller's
 * label.
 *
 * @param seconds - The provider-reported limit window length in seconds.
 * @param fallback - Label to use when the window does not match a known size.
 * @returns A normalized label such as `5h`, `daily`, `weekly`, or `monthly`.
 */
export const limitLabelForWindow = (
  seconds: number,
  fallback: string
): string => {
  const minutes = Math.ceil(seconds / 60);
  const roughly = (expected: number) =>
    minutes >= expected * 0.95 && minutes <= expected * 1.05;
  const hour = 60;
  const day = 24 * hour;

  if (roughly(5 * hour)) {
    return "5h";
  }
  if (roughly(day)) {
    return "daily";
  }
  if (roughly(7 * day)) {
    return "weekly";
  }
  if (roughly(30 * day)) {
    return "monthly";
  }
  return fallback;
};
