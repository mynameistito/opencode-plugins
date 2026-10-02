import { readFile, readdir } from "node:fs/promises";

interface ApiResponse {
  message?: string;
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

interface UpdateRefRequest {
  force: true;
  sha: string;
}

interface CreateRefRequest {
  ref: string;
  sha: string;
}

type ApiRequestBody =
  | CreateTreeRequest
  | CreateCommitRequest
  | UpdateRefRequest
  | CreateRefRequest;

const isApiResponse = (value: unknown): value is ApiResponse =>
  value instanceof Object && !Array.isArray(value);

const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const version = process.env.VERSION;

if (!token || !repository || !version) {
  throw new Error("GH_TOKEN, GITHUB_REPOSITORY, and VERSION are required");
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

const baseSha = process.env.GITHUB_SHA;

if (!baseSha) {
  throw new Error("GITHUB_SHA is required");
}

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
const updateRefPath = "/git/refs/heads/update-opencode-plugin";
let existingRef: ApiResponse | undefined;

try {
  existingRef = await request(refPath, "GET");
} catch (error) {
  if (!(error instanceof Error) || !error.message.includes("Not Found")) {
    throw error;
  }
}

const updateRef = existingRef?.object?.sha
  ? request(updateRefPath, "PATCH", { force: true, sha: commit.sha })
  : request("/git/refs", "POST", {
      ref: "refs/heads/update-opencode-plugin",
      sha: commit.sha,
    });
await updateRef;

console.log(`Pushed verified update commit ${commit.sha}`);
