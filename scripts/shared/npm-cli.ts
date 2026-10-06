import { existsSync } from "node:fs";
import path from "node:path";

import { getNodeExecutablePath } from "@/scripts/shared/node-executable.ts";

/** Resolve the npm CLI shipped alongside the active Node executable. */
export const getNpmCliPath = (): string => {
  const nodeDirectory = path.dirname(getNodeExecutablePath());
  const candidates = [
    path.join(nodeDirectory, "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(
      nodeDirectory,
      "..",
      "lib",
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    ),
  ];
  const npmCliPath = candidates.find(existsSync);

  if (!npmCliPath) {
    throw new Error("The active Node installation does not include npm.");
  }

  return npmCliPath;
};
