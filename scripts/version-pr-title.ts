import { readdirSync, readFileSync } from "node:fs";

const packageNames = new Set<string>();

for (const file of readdirSync(".changeset")) {
  if (!file.endsWith(".md")) {
    continue;
  }

  const content = readFileSync(`.changeset/${file}`, "utf8");
  for (const match of content.matchAll(/^['\"]([^'\"]+)['\"]\s*:/gm)) {
    packageNames.add(match[1]);
  }
}

const names = [...packageNames].sort();
console.log(`Version Package - ${names.join(", ") || "workspace"}`);
