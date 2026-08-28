const UNITS = {
  d: 86_400_000,
  h: 3_600_000,
  m: 60_000,
} as const;

const multiplierFor = (unit: string): number => {
  switch (unit) {
    case "d": {
      return UNITS.d;
    }
    case "h": {
      return UNITS.h;
    }
    case "m": {
      return UNITS.m;
    }
    default: {
      return 0;
    }
  }
};

/** Parse a duration such as `7d` into milliseconds. */
export const parseExpiry = (value: string): number | undefined => {
  const match = /^(?<amount>\d{1,4})(?<unit>[dhm])$/u.exec(value);
  if (!match) {
    return undefined;
  }
  const { amount, unit } = match.groups ?? {};
  if (!amount || !unit) {
    return undefined;
  }
  const multiplier = multiplierFor(unit);
  return Number(amount) * multiplier;
};

/** Return an expiry timestamp when the duration is safe and positive. */
export const expiryAt = (
  value: string,
  now = Date.now()
): number | undefined => {
  const duration = parseExpiry(value);
  if (
    duration === undefined ||
    duration < 60_000 ||
    duration > 31 * 86_400_000
  ) {
    return undefined;
  }
  return now + duration;
};
