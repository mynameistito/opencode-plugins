import type { ProviderCommandError } from "@/errors/command.ts";
import type { MissingProviderCredentialsError } from "@/errors/missing-credentials.ts";
import type { ProviderRateLimitError } from "@/errors/rate-limit.ts";
import type { ProviderResponseDecodeError } from "@/errors/response-decode.ts";
import type { ProviderTimeoutError } from "@/errors/timeout.ts";
import type { ProviderTransportError } from "@/errors/transport.ts";

/** Error raised when plugin configuration cannot be decoded. */
export { ConfigDecodeError } from "@/errors/config-decode.ts";
/** Error raised when an existing plugin configuration file cannot be read. */
export { ConfigReadError } from "@/errors/config-read.ts";
/** Error raised when a provider subprocess fails. */
export { ProviderCommandError } from "@/errors/command.ts";
/** Error raised when no usable credentials are available for a provider. */
export { MissingProviderCredentialsError } from "@/errors/missing-credentials.ts";
/** Error raised when a provider reports a rate limit. */
export { ProviderRateLimitError } from "@/errors/rate-limit.ts";
/** Error raised when a provider response cannot be decoded. */
export { ProviderResponseDecodeError } from "@/errors/response-decode.ts";
/** Error raised when a provider operation exceeds its timeout. */
export { ProviderTimeoutError } from "@/errors/timeout.ts";
/** Error raised when provider communication or filesystem access fails. */
export { ProviderTransportError } from "@/errors/transport.ts";

/** Union of expected provider failures returned by provider adapters. */
export type ProviderError =
  | MissingProviderCredentialsError
  | ProviderTransportError
  | ProviderTimeoutError
  | ProviderRateLimitError
  | ProviderResponseDecodeError
  | ProviderCommandError;
