import {
  asNumber,
  asOptionalNumber,
  asOptionalRecord,
  asOptionalString,
  asRecord,
  asString,
  eventName,
  githubPaginate,
  githubRepository,
  githubRequest,
  readEvent,
  setOutput,
} from "@/github/github-api.ts";
import { isTrustedReleaseBotPullRequest } from "@/github/trusted-preview-author.ts";
import type { JsonValue } from "@/scripts/shared/json-value.ts";
import { getJsonField, parseJsonArray } from "@/scripts/shared/json-value.ts";

interface PullRequest {
  number: number;
  user: { login: string | null } | null;
  base: { ref: string; repo: { id: number | null } | null };
  head: {
    ref: string | null;
    sha: string | null;
    repo: { id: number | null } | null;
  };
}

interface WorkflowRun {
  head_repository: {
    id: number | null;
    owner: { login: string | null } | null;
  } | null;
  head_branch: string | null;
  head_sha: string | null;
  pull_requests: PullRequest[] | null;
}

interface EventPayload {
  repository: { id: number | null; default_branch: string | null } | null;
  workflow_run: WorkflowRun | null;
  pull_request: { number: number } | null;
}

interface PermissionResponse {
  permission: string | null;
  role_name: string | null;
}

const parsePullRequest = (value: JsonValue): PullRequest => {
  const item = asRecord(value);
  const base = asRecord(getJsonField(item, "base"));
  const head = asRecord(getJsonField(item, "head"));
  const user = asOptionalRecord(getJsonField(item, "user"));
  const baseRepo = asOptionalRecord(getJsonField(base, "repo"));
  const headRepo = asOptionalRecord(getJsonField(head, "repo"));
  return {
    base: {
      ref: asString(getJsonField(base, "ref")),
      repo: baseRepo
        ? { id: asOptionalNumber(getJsonField(baseRepo, "id")) }
        : null,
    },
    head: {
      ref: asOptionalString(getJsonField(head, "ref")),
      repo: headRepo
        ? { id: asOptionalNumber(getJsonField(headRepo, "id")) }
        : null,
      sha: asOptionalString(getJsonField(head, "sha")),
    },
    number: asNumber(getJsonField(item, "number")),
    user: user
      ? { login: asOptionalString(getJsonField(user, "login")) }
      : null,
  };
};

const parsePayload = (value: JsonValue): EventPayload => {
  const item = asRecord(value);
  const repository = asOptionalRecord(getJsonField(item, "repository"));
  const workflowRun = asOptionalRecord(getJsonField(item, "workflow_run"));
  const headRepository = workflowRun
    ? asOptionalRecord(getJsonField(workflowRun, "head_repository"))
    : null;
  const headOwner = headRepository
    ? asOptionalRecord(getJsonField(headRepository, "owner"))
    : null;
  const pullRequest = asOptionalRecord(getJsonField(item, "pull_request"));
  const workflowPullRequests = workflowRun
    ? getJsonField(workflowRun, "pull_requests")
    : null;
  return {
    pull_request: pullRequest
      ? { number: asNumber(getJsonField(pullRequest, "number")) }
      : null,
    repository: repository
      ? {
          default_branch: asOptionalString(
            getJsonField(repository, "default_branch")
          ),
          id: asOptionalNumber(getJsonField(repository, "id")),
        }
      : null,
    workflow_run: workflowRun
      ? {
          head_branch: asOptionalString(
            getJsonField(workflowRun, "head_branch")
          ),
          head_repository: headRepository
            ? {
                id: asOptionalNumber(getJsonField(headRepository, "id")),
                owner: headOwner
                  ? {
                      login: asOptionalString(getJsonField(headOwner, "login")),
                    }
                  : null,
              }
            : null,
          head_sha: asOptionalString(getJsonField(workflowRun, "head_sha")),
          pull_requests:
            workflowPullRequests === null
              ? null
              : parseJsonArray(
                  workflowPullRequests,
                  "Workflow run pull_requests"
                ).map(parsePullRequest),
        }
      : null,
  };
};

const parsePermissionResponse = (value: JsonValue): PermissionResponse => {
  const item = asRecord(value);
  return {
    permission: asOptionalString(getJsonField(item, "permission")),
    role_name: asOptionalString(getJsonField(item, "role_name")),
  };
};

const payload = parsePayload(await readEvent());
const defaultBranch = payload.repository?.default_branch ?? null;
if (!defaultBranch) {
  throw new Error(
    "The repository default branch is missing from the event payload."
  );
}

const workflowRun = payload.workflow_run;
const baseRepositoryId = String(payload.repository?.id ?? "");
const headRepositoryId = String(workflowRun?.head_repository?.id ?? "");
const headBranch = workflowRun?.head_branch ?? null;
const headSha = workflowRun?.head_sha ?? null;

const matchesWorkflowRun = (candidate: PullRequest): boolean =>
  [
    String(candidate.head.repo?.id ?? "") === headRepositoryId,
    candidate.head.ref === headBranch,
    candidate.head.sha === headSha,
    String(candidate.base.repo?.id ?? "") === baseRepositoryId,
    candidate.base.ref === defaultBranch,
  ].every(Boolean);

let pullRequest: PullRequest | null = null;

if (eventName() === "pull_request_target") {
  const number = payload.pull_request?.number ?? null;
  if (!number) {
    throw new Error(
      "The pull request number is missing from the event payload."
    );
  }
  pullRequest = await githubRequest(
    `/repos/${githubRepository.owner}/${githubRepository.repo}/pulls/${number}`,
    parsePullRequest
  );
} else {
  if (!baseRepositoryId || !headRepositoryId || !headBranch || !headSha) {
    throw new Error("The workflow run is missing pull request identity data.");
  }

  const candidates = (
    Array.isArray(workflowRun?.pull_requests) ? workflowRun.pull_requests : []
  ).filter(matchesWorkflowRun);
  if (candidates.length > 1) {
    throw new Error(
      `Expected one pull request for ${headBranch} at ${headSha}, found ${candidates.length}.`
    );
  }

  if (candidates.length === 1) {
    pullRequest = await githubRequest(
      `/repos/${githubRepository.owner}/${githubRepository.repo}/pulls/${candidates[0]?.number}`,
      parsePullRequest
    );
  } else {
    const headOwner = workflowRun?.head_repository?.owner?.login ?? null;
    if (!headOwner) {
      throw new Error(
        "The workflow run is missing pull request head repository data."
      );
    }
    const query = new URLSearchParams({
      base: defaultBranch,
      head: `${headOwner}:${headBranch}`,
      state: "all",
    });
    const pullRequests = await githubPaginate(
      `/repos/${githubRepository.owner}/${githubRepository.repo}/pulls?${query}`,
      parsePullRequest
    );
    const matches = pullRequests.filter(matchesWorkflowRun);

    if (matches.length > 1) {
      throw new Error(
        `Expected one pull request for ${headOwner}:${headBranch} at ${headSha}, found ${matches.length}.`
      );
    }
    if (matches.length === 0) {
      console.info(
        `No pull request currently sits at head ${headSha} for ${headOwner}:${headBranch}; the branch moved on, so there is nothing to deploy for this run.`
      );
      process.exit(0);
    }
    pullRequest = matches[0] ?? null;
  }
}

if (pullRequest === null || pullRequest.base.ref !== defaultBranch) {
  throw new Error(
    "The preview pull request does not target the default branch."
  );
}
if (eventName() === "workflow_run" && !matchesWorkflowRun(pullRequest)) {
  console.info(
    `The pull request head moved past ${headSha} while resolving; there is nothing to deploy for this run.`
  );
  process.exit(0);
}

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
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `Could not verify ${username}'s repository access; treating the PR as untrusted: ${message}`
  );
}

const trusted =
  ["admin", "write", "maintain", "push"].includes(permission) ||
  isTrustedReleaseBotPullRequest({
    baseRef: pullRequest.base.ref,
    baseRepositoryId: pullRequest.base.repo?.id ?? null,
    headRef: pullRequest.head.ref,
    headRepositoryId: pullRequest.head.repo?.id ?? null,
    username,
  });
console.info(
  `Pull request #${pullRequest.number} author ${username} has ${permission} access.`
);
await setOutput("pull_request_number", String(pullRequest.number));
await setOutput("trusted", String(trusted));
