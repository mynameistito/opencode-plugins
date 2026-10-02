import { readFile, readdir } from "node:fs/promises";

interface ApiResponse {
  message?: string;
  node_id?: string;
  sha?: string;
  tree?: { sha: string };
  verification?: { verified: boolean; reason: string };
  object?: { sha: string };
}

interface CreateTreeRequest {
  base_tree: string;
  tree: {
    content: string;
    mode: "100644";
    path: string;
    type: "blob";
  }[];
}

interface CreateCommitRequest {
  message: string;
  parents: string[];
  tree: string;
}

type ApiRequestBody = CreateTreeRequest | CreateCommitRequest;

interface GraphQLResponse {
  data?: { updateRefs?: { clientMutationId: string | null } };
  errors?: unknown;
}

const isApiResponse = (value: unknown): value is ApiResponse =>
  value instanceof Object && !Array.isArray(value);

const isGraphQLResponse = (value: unknown): value is GraphQLResponse => {
  if (!(value instanceof Object) || Array.isArray(value)) {
    return false;
  }

  if (
    !("data" in value) ||
    !(value.data instanceof Object) ||
    Array.isArray(value.data) ||
    !("updateRefs" in value.data)
  ) {
    return false;
  }

  return !(
    "errors" in value &&
    (!Array.isArray(value.errors) || value.errors.length > 0)
  );
};

const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const version = process.env.VERSION;
const mainSha = process.env.MAIN_SHA;

if (!token || !repository || !version || !mainSha) {
  throw new Error(
    "GH_TOKEN, GITHUB_REPOSITORY, MAIN_SHA, and VERSION are required"
  );
}

const request = async (
  path: string,
  method: "GET" | "POST" | "PATCH",
  body?: ApiRequestBody
): Promise<ApiResponse> => {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const init: RequestInit = { headers, method };

  if (body) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  const response = await fetch(
    `https://api.github.com/repos/${repository}${path}`,
    init
  );

  const result: unknown = await response.json();

  if (!response.ok) {
    const message =
      isApiResponse(result) && result.message
        ? String(result.message)
        : response.statusText;
    throw new Error(`GitHub API ${method} ${path} failed: ${message}`);
  }

  if (!isApiResponse(result)) {
    throw new Error(
      `GitHub API ${method} ${path} returned an invalid response`
    );
  }

  return result;
};

const changesetDirectoryEntries = await readdir(".changeset", {
  withFileTypes: true,
});
const changesetFiles = changesetDirectoryEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => `.changeset/${entry.name}`);
const changedFiles = ["package.json", "bun.lock", ...changesetFiles];

const baseSha = mainSha;

const baseCommit = await request(`/git/commits/${baseSha}`, "GET");

if (!baseCommit.tree?.sha) {
  throw new Error("GitHub API did not return the base tree SHA");
}

const treeEntries = await Promise.all(
  changedFiles.map(async (path) => ({
    content: await readFile(path, "utf-8"),
    mode: "100644" as const,
    path,
    type: "blob" as const,
  }))
);

const tree = await request("/git/trees", "POST", {
  base_tree: baseCommit.tree.sha,
  tree: treeEntries,
});

if (!tree.sha) {
  throw new Error("GitHub API did not return a tree SHA");
}

const commit = await request("/git/commits", "POST", {
  message: `chore(deps): update @opencode/plugin to ${version}`,
  parents: [baseSha],
  tree: tree.sha,
});

if (!commit.sha || !commit.verification?.verified) {
  throw new Error(
    `GitHub did not verify the update commit (reason: ${commit.verification?.reason ?? "unknown"})`
  );
}

const refPath = "/git/ref/heads/update-opencode-plugin";
let existingRef: ApiResponse | undefined;

try {
  existingRef = await request(refPath, "GET");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("Not Found")) {
    throw error;
  }
}

const repositoryInfo = await request("", "GET");

if (!repositoryInfo.node_id) {
  throw new Error("GitHub API did not return the repository node ID");
}

const refUpdateResponse = await fetch("https://api.github.com/graphql", {
  body: JSON.stringify({
    query:
      "mutation($repositoryId: ID!, $refUpdates: [RefUpdate!]!) { updateRefs(input: { repositoryId: $repositoryId, refUpdates: $refUpdates }) { clientMutationId } }",
    variables: {
      refUpdates: [
        {
          afterOid: commit.sha,
          beforeOid:
            existingRef?.object?.sha ??
            "0000000000000000000000000000000000000000",
          force: true,
          name: "refs/heads/update-opencode-plugin",
        },
      ],
      repositoryId: repositoryInfo.node_id,
    },
  }),
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  method: "POST",
});
const refUpdateResult: unknown = await refUpdateResponse.json();

const graphQLResult = isGraphQLResponse(refUpdateResult)
  ? refUpdateResult
  : undefined;
const hasGraphQLErrors = Array.isArray(graphQLResult?.errors)
  ? graphQLResult.errors.length > 0
  : false;

if (
  !refUpdateResponse.ok ||
  hasGraphQLErrors ||
  !graphQLResult?.data?.updateRefs
) {
  throw new Error(
    `GitHub API failed to update the update branch: ${JSON.stringify(graphQLResult?.errors ?? refUpdateResponse.statusText)}`
  );
}

console.log(`Pushed verified update commit ${commit.sha}`);
