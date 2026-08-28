// This parser validates the untrusted Worker response at the HTTP boundary.
// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion
/** Worker creation response. */
export interface CreateShareResponse {
  readonly id: string;
  readonly expiresAt: number;
}

/** Parse a successful Worker response without exposing its body. */
export const parseCreateResponse = (
  value: unknown
): CreateShareResponse | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && typeof record.expiresAt === "number"
    ? { expiresAt: record.expiresAt, id: record.id }
    : undefined;
};
