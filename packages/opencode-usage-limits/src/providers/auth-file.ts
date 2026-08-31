import { Effect } from "effect";
import type { Redacted } from "effect";

import { ProviderEnvironment } from "@/providers/runtime/environment.ts";
import { ProviderFileSystem } from "@/providers/runtime/filesystem.ts";
import type { ProviderID } from "@/types.ts";
import { isRecord } from "@/utils.ts";
import type { JsonObject, JsonValue } from "@/utils.ts";

/** Extracts a credential from a parsed provider auth-file object. */
export type AuthFileCredentialExtractor = (
  value: JsonObject,
  credential: (
    value: JsonValue | undefined
  ) => Redacted.Redacted<string> | undefined
) => Redacted.Redacted<string> | undefined;

/**
 * Loads a credential from an optional provider auth file.
 *
 * Missing, unreadable, malformed, and non-object files yield `undefined` so the
 * caller can continue its provider-specific credential lookup order.
 *
 * @param authPath - Optional path to the provider auth file.
 * @param providerID - Provider ID used to classify filesystem failures.
 * @param extractor - Provider-specific credential extractor for object JSON.
 * @returns The extracted credential, or `undefined` when loading cannot supply one.
 */
export const readProviderAuthFileCredential = (
  authPath: string | undefined,
  providerID: ProviderID,
  extractor: AuthFileCredentialExtractor
): Effect.Effect<
  Redacted.Redacted<string> | undefined,
  never,
  ProviderEnvironment | ProviderFileSystem
> => {
  if (!authPath) {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- The helper's successful absence value is undefined, not void.
    return Effect.succeed<undefined>(undefined);
  }
  return Effect.gen(function* loadProviderAuthFileCredential() {
    const files = yield* ProviderFileSystem;
    const environment = yield* ProviderEnvironment;
    const auth = yield* files.readJson({ path: authPath, providerID });
    return isRecord(auth) ? extractor(auth, environment.credential) : undefined;
  }).pipe(
    // oxlint-disable-next-line unicorn/no-useless-undefined -- The catch-all preserves the helper's undefined absence value.
    Effect.catchCause(() => Effect.succeed<undefined>(undefined))
  );
};
