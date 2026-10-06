interface PullRequestIdentity {
  username: string | null;
  baseRef: string;
  baseRepositoryId: number | null;
  headRef: string | null;
  headRepositoryId: number | null;
}

export const isTrustedReleaseBotPullRequest = ({
  username,
  baseRef,
  baseRepositoryId,
  headRef,
  headRepositoryId,
}: PullRequestIdentity): boolean => {
  if (username !== "tito-release-bot[bot]") {
    return false;
  }
  if (baseRef !== "main" || headRef !== "changeset-release/main") {
    return false;
  }
  return baseRepositoryId !== null && headRepositoryId === baseRepositoryId;
};
