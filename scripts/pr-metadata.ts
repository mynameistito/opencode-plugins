import {
  getComponentLabels,
  getMissingChangesets,
  getPullRequestFilePageCount,
  getRequiredChangesets,
  getSizeLabel,
  isChangesetReleasePR,
  isDuplicateLabelError,
  packageLabels,
  parseChangesetEntries,
  reconcileLabels,
} from "./pr-metadata-helpers.ts";

const owner = process.env.GITHUB_REPOSITORY?.split("/")[0];
const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
const token = process.env.GITHUB_TOKEN;
const pullRequestNumber = Number(process.env.PR_NUMBER);
const headSha = process.env.PR_HEAD_SHA;

if (!owner || !repository || !token || !Number.isInteger(pullRequestNumber)) {
  throw new Error(
    "Missing GitHub repository, token, or pull request metadata."
  );
}

class GitHubApiError extends Error {
  override readonly name = "GitHubApiError";
  readonly status: number;
  readonly responseBody: string;

  constructor(status: number, responseBody: string) {
    super(`GitHub API ${status}: ${responseBody}`);
    this.status = status;
    this.responseBody = responseBody;
  }
}

const api = async <T>(endpoint: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new GitHubApiError(response.status, await response.text());
  }
  if (response.status === 204) {
    // SAFETY: The DELETE label endpoint returns no response body.
    return undefined as T;
  }
  // SAFETY: Each caller pairs this response with the schema for the requested GitHub API endpoint.
  return (await response.json()) as T;
};

interface PullRequestFile {
  filename: string;
  additions: number;
  deletions: number;
}

interface PullRequest {
  head: {
    ref: string;
    sha: string;
    repo?: { full_name?: string } | null;
  };
  labels: { name: string }[];
  changed_files: number;
}

const pullRequest = await api<PullRequest>(
  `/repos/${owner}/${repository}/pulls/${pullRequestNumber}`
);
if (headSha && pullRequest.head.sha !== headSha) {
  console.log(
    `Skipping stale event for ${headSha}; pull request now points to ${pullRequest.head.sha}.`
  );
  process.exit(0);
}
const pageCount = getPullRequestFilePageCount(pullRequest.changed_files);
const filePages = await Promise.all(
  Array.from({ length: pageCount }, (_, index) =>
    api<PullRequestFile[]>(
      `/repos/${owner}/${repository}/pulls/${pullRequestNumber}/files?per_page=100&page=${index + 1}`
    )
  )
);
const files = filePages.flat();

const componentLabels = new Set(packageLabels.values());
const managedLabels = new Set([
  ...componentLabels,
  "release",
  "dependencies",
  "github-actions",
  "size/xs",
  "size/s",
  "size/m",
  "size/l",
  "size/xl",
]);

const changesetFiles = files.filter(({ filename }) =>
  /^\.changeset\/(?!README\.md$)[^/]+\.md$/u.test(filename)
);
const headRepository =
  pullRequest.head.repo?.full_name ?? `${owner}/${repository}`;
const changesetContents = await Promise.all(
  changesetFiles.map(async ({ filename }) => {
    try {
      const encodedPath = filename.split("/").map(encodeURIComponent).join("/");
      const file = await api<{ content?: string; encoding?: string }>(
        `/repos/${headRepository}/contents/${encodedPath}?ref=${encodeURIComponent(headSha ?? pullRequest.head.sha)}`
      );
      if (file.encoding !== "base64" || !file.content) {
        return [];
      }
      const content = Buffer.from(file.content, "base64").toString("utf-8");
      return parseChangesetEntries(content);
    } catch (error) {
      console.warn(
        `Could not read Changeset ${filename}; ignoring it: ${String(error)}`
      );
      return [];
    }
  })
);
const changesetNames = new Set(changesetContents.flat());
const components = getComponentLabels(
  files.map(({ filename }) => filename),
  changesetNames
);

const labelSet = new Set<string>(components);
if (files.some(({ filename }) => filename.startsWith(".changeset/"))) {
  labelSet.add("release");
}
if (
  files.some(
    ({ filename }) =>
      filename === "package.json" ||
      filename.endsWith("/package.json") ||
      ["bun.lock", "bun.lockb"].includes(filename)
  )
) {
  labelSet.add("dependencies");
}
if (files.some(({ filename }) => filename.startsWith(".github/"))) {
  labelSet.add("github-actions");
}

const sizeLabel = getSizeLabel(files);
labelSet.add(sizeLabel);

const currentLabels = pullRequest.labels.map(({ name }) => name);
const skipChangesetLabel = "skip-changeset";
const ensureLabels = new Set([
  ...labelSet,
  ...(currentLabels.includes(skipChangesetLabel) ? [] : [skipChangesetLabel]),
]);
const labelsEndpoint = `/repos/${owner}/${repository}/labels`;
const getLabelColor = (name: string): string => {
  if (name === skipChangesetLabel) {
    return "d4c5f9";
  }
  if (name.startsWith("size/")) {
    return "ededed";
  }
  return "1d76db";
};
await Promise.all(
  [...ensureLabels].map(async (name) => {
    const color = getLabelColor(name);
    const description =
      name === skipChangesetLabel
        ? "Use only for justified changes that do not require a release."
        : "Automatically managed pull request metadata";
    try {
      await api(labelsEndpoint, {
        body: JSON.stringify({
          color,
          description,
          name,
        }),
        method: "POST",
      });
    } catch (error) {
      if (
        !(error instanceof GitHubApiError) ||
        !isDuplicateLabelError(error.status, error.responseBody)
      ) {
        throw error;
      }
      await api(`${labelsEndpoint}/${encodeURIComponent(name)}`, {
        body: JSON.stringify({ color, description, name }),
        method: "PATCH",
      });
    }
  })
);

const { add: labelsToAdd, remove: labelsToRemove } = reconcileLabels(
  currentLabels,
  labelSet,
  managedLabels
);
if (labelsToAdd.length > 0) {
  await api(
    `/repos/${owner}/${repository}/issues/${pullRequestNumber}/labels`,
    {
      body: JSON.stringify({ labels: labelsToAdd }),
      method: "POST",
    }
  );
}
if (labelsToRemove.length > 0) {
  await Promise.all(
    labelsToRemove.map((name) =>
      api(
        `/repos/${owner}/${repository}/issues/${pullRequestNumber}/labels/${encodeURIComponent(name)}`,
        { method: "DELETE" }
      )
    )
  );
}

const skipChangeset = currentLabels.includes(skipChangesetLabel);
const requiredPackages =
  skipChangeset || isChangesetReleasePR(pullRequest.head.ref)
    ? new Set<string>()
    : getRequiredChangesets(files.map(({ filename }) => filename));

const missingPackages = getMissingChangesets(requiredPackages, changesetNames);
if (missingPackages.length > 0) {
  throw new Error(
    `Changeset required for changed published/deployed package(s):\n${missingPackages
      .map(
        (name) =>
          `- ${name} (missing a valid entry in a changed .changeset/*.md file)`
      )
      .join(
        "\n"
      )}\nAdd a Changeset or apply the skip-changeset label for a justified non-release change.`
  );
}

console.log(
  `PR metadata reconciled: ${[...labelSet].join(", ")}; Changeset coverage passed${skipChangeset ? " (skip-changeset label)" : ""}.`
);
