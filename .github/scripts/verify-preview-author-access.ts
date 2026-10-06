import {
  asNumber,
  asOptionalRecord,
  asOptionalString,
  asRecord,
  githubRepository,
  githubRequest,
  setOutput,
} from "@/github/github-api.ts";
import type { JsonValue } from "@/scripts/shared/json-value.ts";
import { getJsonField } from "@/scripts/shared/json-value.ts";

interface PullRequest {
  number: number;
  user: { login: string | null } | null;
}

interface PermissionResponse {
  permission: string | null;
  role_name: string | null;
}

const parsePullRequest = (value: JsonValue): PullRequest => {
  const pullRequest = asRecord(value);
  const user = asOptionalRecord(getJsonField(pullRequest, "user"));
  return {
    number: asNumber(getJsonField(pullRequest, "number")),
    user: user
      ? { login: asOptionalString(getJsonField(user, "login")) }
      : null,
  };
};

const parsePermissionResponse = (value: JsonValue): PermissionResponse => {
  const permission = asRecord(value);
  return {
    permission: asOptionalString(getJsonField(permission, "permission")),
    role_name: asOptionalString(getJsonField(permission, "role_name")),
  };
};

const pullRequestNumber = Number(process.env.PULL_REQUEST_NUMBER);
if (!Number.isInteger(pullRequestNumber)) {
  throw new TypeError("The preview pull request number is missing.");
}

const pullRequest = await githubRequest(
  `/repos/${githubRepository.owner}/${githubRepository.repo}/pulls/${pullRequestNumber}`,
  parsePullRequest
);
const username = pullRequest.user?.login ?? null;
if (!username) {
  throw new Error("The preview pull request author is missing.");
}

let permission = "none";
try {
  const result = await githubRequest(
    `/repos/${githubRepository.owner}/${githubRepository.repo}/collaborators/${encodeURIComponent(username)}/permission`,
    parsePermissionResponse
  );
  permission = result.permission ?? result.role_name ?? "none";
} catch {
  throw new Error(`Could not verify ${username}'s repository access.`);
}

const trusted = ["admin", "write", "maintain", "push"].includes(permission);
console.info(
  `Pull request #${pullRequest.number} author ${username} currently has ${permission} access.`
);
await setOutput("trusted", String(trusted));
if (!trusted) {
  throw new Error(`${username} no longer has write access to the repository.`);
}
