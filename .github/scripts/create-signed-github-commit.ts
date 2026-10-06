import { readFile, readdir } from "node:fs/promises";

import type { JsonValue } from "@/scripts/shared/json-value.ts";
import {
  parseJsonObject,
  parseJsonString,
} from "@/scripts/shared/json-value.ts";

interface ApiResponse {
  data: JsonValue | null;
  errors: JsonValue | null;
  message: string | null;
  node_id: string | null;
  sha: string | null;
  tree: { sha: string } | null;
  verification: { verified: boolean; reason: string } | null;
  object: { sha: string } | null;
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

const parseNullableString = (value: JsonValue): string | null =>
  value === null ? null : parseJsonString(value, "GitHub response string");

const parseApiResponse = (value: JsonValue): ApiResponse => {
  const response = parseJsonObject(value, "GitHub API response");
  const treeValue = response.get("tree") ?? null;
  const verificationValue = response.get("verification") ?? null;
  const objectValue = response.get("object") ?? null;
  const tree =
    treeValue === null || Array.isArray(treeValue)
      ? null
      : parseJsonObject(treeValue, "Git tree");
  const verification =
    verificationValue === null
      ? null
      : parseJsonObject(verificationValue, "Commit verification");
  const refObject =
    objectValue === null
      ? null
      : parseJsonObject(objectValue, "Git ref object");
  return {
    data: response.get("data") ?? null,
    errors: response.get("errors") ?? null,
    message: parseNullableString(response.get("message") ?? null),
    node_id: parseNullableString(response.get("node_id") ?? null),
    object: refObject
      ? { sha: parseJsonString(refObject.get("sha") ?? null, "Git object SHA") }
      : null,
    sha: parseNullableString(response.get("sha") ?? null),
    tree: tree
      ? { sha: parseJsonString(tree.get("sha") ?? null, "Tree SHA") }
      : null,
    verification: verification
      ? {
          reason: parseJsonString(
            verification.get("reason") ?? null,
            "Verification reason"
          ),
          verified: verification.get("verified") === true,
        }
      : null,
  };
};

const hasUpdateRefs = (response: ApiResponse | null): boolean => {
  if (response === null || response.data === null) {
    return false;
  }
  const data = parseJsonObject(response.data, "GraphQL response data");
  return data.has("updateRefs") && data.get("updateRefs") !== null;
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
  body: ApiRequestBody | null
): Promise<ApiResponse> => {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  });
  const init: RequestInit = { headers, method };

  if (body !== null) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  const response = await fetch(
    `https://api.github.com/repos/${repository}${path}`,
    init
  );

  if (!response.ok) {
    const responseText = await response.text();
    let message = response.statusText;

    try {
      const errorResponse = parseApiResponse(JSON.parse(responseText));
      message = errorResponse.message || message;
    } catch {
      // Keep the HTTP error useful when GitHub returns a non-JSON error body.
    }

    throw new Error(
      `GitHub API ${method} ${path} failed (${response.status}): ${message}`
    );
  }

  return parseApiResponse(JSON.parse(await response.text()));
};

const changesetDirectoryEntries = await readdir(".changeset", {
  withFileTypes: true,
});
const changesetFiles = changesetDirectoryEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .map((entry) => `.changeset/${entry.name}`);
const changedFiles = ["package.json", "bun.lock", ...changesetFiles];

const baseSha = mainSha;

const baseCommit = await request(`/git/commits/${baseSha}`, "GET", null);

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
    `GitHub did not verify the update commit (reason: ${commit.verification?.reason ?? "not provided"})`
  );
}

const refPath = "/git/ref/heads/update-opencode-plugin";
let existingRef: ApiResponse | null = null;

try {
  existingRef = await request(refPath, "GET", null);
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("Not Found")) {
    throw error;
  }
}

const repositoryInfo = await request("", "GET", null);

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
const graphQLResult = parseApiResponse(
  JSON.parse(await refUpdateResponse.text())
);
const hasGraphQLErrors =
  graphQLResult.errors !== null && Array.isArray(graphQLResult.errors)
    ? graphQLResult.errors.length > 0
    : false;

if (
  !refUpdateResponse.ok ||
  hasGraphQLErrors ||
  !hasUpdateRefs(graphQLResult)
) {
  throw new Error(
    `GitHub API failed to update the update branch: ${JSON.stringify(graphQLResult?.errors ?? refUpdateResponse.statusText)}`
  );
}

console.log(`Pushed verified update commit ${commit.sha}`);
