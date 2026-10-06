import {
  asNumber,
  asOptionalString,
  asRecord,
  githubPaginate,
  githubRepository,
  githubRequest,
} from "@/github/github-api.ts";
import type { JsonValue } from "@/scripts/shared/json-value.ts";
import { getJsonField } from "@/scripts/shared/json-value.ts";

interface Comment {
  id: number;
  body: string | null;
}

const parseComment = (value: JsonValue): Comment => {
  const comment = asRecord(value);
  return {
    body: asOptionalString(getJsonField(comment, "body")),
    id: asNumber(getJsonField(comment, "id")),
  };
};

const pullRequestNumber = Number(process.env.PULL_REQUEST_NUMBER);
if (!Number.isInteger(pullRequestNumber)) {
  throw new TypeError("The preview pull request number is missing.");
}

const serverUrl = process.env.GITHUB_SERVER_URL;
const runId = process.env.GITHUB_RUN_ID;
if (!serverUrl || !runId) {
  throw new Error("GITHUB_SERVER_URL and GITHUB_RUN_ID are required.");
}

const marker = "<!-- docs-preview-approval -->";
const runUrl = `${serverUrl}/${githubRepository.owner}/${githubRepository.repo}/actions/runs/${runId}`;
const body = `${marker}\nThe documentation preview is waiting for approval. [Open the workflow run and click **Review deployments**](${runUrl}).`;
const path = `/repos/${githubRepository.owner}/${githubRepository.repo}/issues/${pullRequestNumber}/comments`;
const comments = await githubPaginate(path, parseComment);
const existing =
  comments.find((comment) => comment.body?.includes(marker)) ?? null;

await githubRequest(existing ? `${path}/${existing.id}` : path, parseComment, {
  body: JSON.stringify({ body }),
  headers: { "Content-Type": "application/json" },
  method: existing ? "PATCH" : "POST",
});
