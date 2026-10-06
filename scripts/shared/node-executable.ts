import { existsSync, statSync } from "node:fs";
import path from "node:path";

/** Resolve Node from the explicit workflow setting or the local PATH. */
export const getNodeExecutablePath = (): string => {
  const configuredPath = process.env.NODE_EXECUTABLE;
  if (configuredPath) {
    if (!path.isAbsolute(configuredPath) || !existsSync(configuredPath)) {
      throw new Error("NODE_EXECUTABLE must be an existing absolute path.");
    }
    return configuredPath;
  }

  if (/^node(?:\.exe)?$/iu.test(path.basename(process.execPath))) {
    return process.execPath;
  }

  const pathDirectories = process.env.PATH?.split(path.delimiter) ?? [];
  const executableNames =
    process.platform === "win32" ? ["node.exe", "node"] : ["node"];
  for (const directory of pathDirectories) {
    for (const executableName of executableNames) {
      const candidate = path.resolve(directory, executableName);
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }

  throw new Error("Node executable was not found. Set NODE_EXECUTABLE.");
};
