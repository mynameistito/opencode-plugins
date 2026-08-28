// These values come from the untyped plugin configuration boundary.
// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters
/** Raw V2 plugin options. */
export interface ShareOptions {
  readonly endpoint?: unknown;
  readonly tokenEnv?: unknown;
  readonly defaultExpiry?: unknown;
  readonly sanitize?: unknown;
  readonly maxPayloadBytes?: unknown;
}
/** Resolved plugin configuration. */
export interface ShareConfig {
  readonly endpoint: string;
  readonly tokenEnv: string;
  readonly defaultExpiry: string;
  readonly sanitize: boolean;
  readonly maxPayloadBytes: number;
}

const resolveEndpoint = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
};

/** Resolve and constrain plugin options without reading secrets. */
export const resolveConfig = (options: ShareOptions): ShareConfig => ({
  defaultExpiry:
    typeof options.defaultExpiry === "string" ? options.defaultExpiry : "7d",
  endpoint: resolveEndpoint(options.endpoint),
  maxPayloadBytes:
    typeof options.maxPayloadBytes === "number" &&
    Number.isSafeInteger(options.maxPayloadBytes) &&
    options.maxPayloadBytes > 0
      ? options.maxPayloadBytes
      : 5_242_880,
  sanitize: options.sanitize !== false,
  tokenEnv:
    typeof options.tokenEnv === "string"
      ? options.tokenEnv
      : "OPENCODE_SHARE_INGEST_TOKEN",
});
