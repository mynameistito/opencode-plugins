import { readdirSync, readFileSync } from "node:fs";

const packageNames = new Set<string>();

for (const file of readdirSync(".changeset")) {
  if (!file.endsWith(".md")) {
    continue;
  }

  const content = readFileSync(`.changeset/${file}`, "utf-8");
  for (const match of content.matchAll(/^['"](?<name>[^'"]+)['"]\s*:/gmu)) {
    const name = match.groups?.name;
    if (name) {
      packageNames.add(name);
    }
  }
}

const names = [...packageNames].toSorted();
console.log(`Version Package - ${names.join(", ") || "workspace"}`);
