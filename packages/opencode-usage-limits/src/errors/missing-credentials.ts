import {
  credentialMessages,
  ProviderIDSchema,
  ProviderOperationSchema,
  schemaTaggedError,
} from "@/errors-shared.ts";

/** Expected provider error raised when no usable credentials are configured. */
export class MissingProviderCredentialsError extends schemaTaggedError<MissingProviderCredentialsError>()(
  "MissingProviderCredentialsError",
  {
    operation: ProviderOperationSchema,
    providerID: ProviderIDSchema,
  }
) {
  readonly kind = "missing_credentials" as const;

  override get message(): string {
    return credentialMessages[this.providerID];
  }
}
