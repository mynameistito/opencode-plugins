import { appendFile, readFile } from "node:fs/promises";

import type { JsonObject, JsonValue } from "@/scripts/shared/json-value.ts";
import {
  parseJsonArray,
  parseJsonNumber,
  parseJsonObject,
  parseJsonString,
} from "@/scripts/shared/json-value.ts";

const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
const apiResponseContext = "GitHub API response";
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

if (!token || !repository) {
  throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
}

const [owner, repo] = repository.split("/");

if (!owner || !repo) {
  throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`);
}

export const githubRepository = { owner, repo };

export const githubRequest = async function githubRequest<T>(
  path: string,
  decode: (value: JsonValue) => T,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API ${path} returned ${response.status}: ${await response.text()}`
    );
  }

  const value: JsonValue = JSON.parse(await response.text());
  return decode(value);
};

export const githubPaginate = function githubPaginate<T>(
  path: string,
  decode: (value: JsonValue) => T
): Promise<T[]> {
  const readPage = async (page: number, results: T[]): Promise<T[]> => {
    const separator = path.includes("?") ? "&" : "?";
    const pageResults = await githubRequest(
      `${path}${separator}per_page=100&page=${page}`,
      (value) =>
        parseJsonArray(value, "GitHub API pagination response").map(decode)
    );
    if (pageResults.length < 100) {
      return [...results, ...pageResults];
    }
    return readPage(page + 1, [...results, ...pageResults]);
  };

  return readPage(1, []);
};

export const readEvent = async function readEvent(): Promise<JsonValue> {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH is required.");
  }
  const event: JsonValue = JSON.parse(await readFile(eventPath, "utf-8"));
  return event;
};

export const asRecord = (value: JsonValue): JsonObject =>
  parseJsonObject(value, apiResponseContext);

export const asString = (value: JsonValue): string =>
  parseJsonString(value, apiResponseContext);

export const asNumber = (value: JsonValue): number =>
  parseJsonNumber(value, apiResponseContext);

export const asOptionalRecord = (
  value: JsonValue | null
): JsonObject | null => {
  if (value === null) {
    return null;
  }
  return asRecord(value);
};

export const asOptionalString = (value: JsonValue | null): string | null => {
  if (value === null) {
    return null;
  }
  return asString(value);
};

export const asOptionalNumber = (value: JsonValue | null): number | null => {
  if (value === null) {
    return null;
  }
  return asNumber(value);
};

export const setOutput = async (name: string, value: string): Promise<void> => {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT is required.");
  }
  await appendFile(outputPath, `${name}=${value}\n`);
};

export const eventName = (): string => {
  const name = process.env.GITHUB_EVENT_NAME;
  if (!name) {
    throw new Error("GITHUB_EVENT_NAME is required.");
  }
  return name;
};
