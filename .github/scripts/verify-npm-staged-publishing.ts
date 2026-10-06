import { execFileSync } from "node:child_process";

import { getNpmCliPath } from "@/scripts/shared/npm-cli.ts";

const version = execFileSync(process.execPath, [getNpmCliPath(), "--version"], {
  encoding: "utf-8",
}).trim();
const [major = 0, minor = 0] = version.split(".").map(Number);
const supported = major > 11 || (major === 11 && minor >= 15);

if (!supported) {
  throw new Error(
    `npm ${version} does not support staged publishing. Use npm >= 11.15.0.`
  );
}
