import { describe, expect, it } from "vitest";

import { isTrustedReleaseBotPullRequest } from "@/github/trusted-preview-author.ts";

const releasePullRequest = {
  baseRef: "main",
  baseRepositoryId: 123,
  headRef: "changeset-release/main",
  headRepositoryId: 123,
  username: "tito-release-bot[bot]",
};

describe("trusted release bot preview author", () => {
  it("trusts the release bot's same-repository release PR", () => {
    expect(isTrustedReleaseBotPullRequest(releasePullRequest)).toBeTruthy();
  });

  it.each([
    {
      headRef: "changeset-release/main",
      headRepositoryId: 123,
      username: "someone-else",
    },
    {
      headRef: "feature",
      headRepositoryId: 123,
      username: "tito-release-bot[bot]",
    },
    {
      headRef: "changeset-release/main",
      headRepositoryId: 456,
      username: "tito-release-bot[bot]",
    },
    {
      baseRef: "other",
      headRef: "changeset-release/main",
      username: "tito-release-bot[bot]",
    },
  ])(
    "does not trust a different author, branch, or repository: %o",
    (override) => {
      expect(
        isTrustedReleaseBotPullRequest({ ...releasePullRequest, ...override })
      ).toBeFalsy();
    }
  );
});
