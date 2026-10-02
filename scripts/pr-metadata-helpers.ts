export const packageLabels = new Map([
  ["@mynameistito/opencode-force-input", "force-input"],
  ["@mynameistito/opencode-usage-limits", "usage-limits"],
  ["@mynameistito/opencode-plugins-docs", "docs"],
]);

const pathLabels = new Map([
  ["packages/opencode-force-input/", "force-input"],
  ["packages/opencode-usage-limits/", "usage-limits"],
  ["apps/web/", "docs"],
]);

const meaningfulPackageFile = (filename: string): boolean => {
  const segments = filename.split("/");
  const excludedDirectory = segments.some((segment) =>
    ["__tests__", "scripts"].includes(segment)
  );
  const excludedFile = [
    "AGENTS.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    "SECURITY.md",
    "tsconfig.json",
    "vitest.config.ts",
    "vitest.setup.ts",
  ].includes(segments.at(-1) ?? "");
  return !excludedDirectory && !excludedFile;
};

export const parseChangesetEntries = (content: string): string[] => {
  const lines = content.split(/\r?\n/u);
  const opening = lines.indexOf("---");
  const closing = lines.indexOf("---", opening + 1);
  if (opening !== 0 || closing === -1) {
    return [];
  }
  const names: string[] = [];
  for (const line of lines.slice(opening + 1, closing)) {
    const entry = line.match(
      /^\s*["'](?<name>[^"']+)["']\s*:\s*(?<bump>patch|minor|major)\s*(?:#.*)?$/u
    );
    const name = entry?.groups?.name;
    if (name && packageLabels.has(name)) {
      names.push(name);
    }
  }
  return names;
};

export const getComponentLabels = (
  filenames: string[],
  changesetNames: Iterable<string>
): Set<string> => {
  const labels = new Set<string>();
  for (const filename of filenames) {
    for (const [path, label] of pathLabels) {
      if (filename.startsWith(path)) {
        labels.add(label);
      }
    }
  }
  for (const name of changesetNames) {
    const label = packageLabels.get(name);
    if (label) {
      labels.add(label);
    }
  }
  return labels;
};

interface ChangedFile {
  filename: string;
  additions: number;
  deletions: number;
}

export const getSizeLabel = (files: ChangedFile[]): string => {
  const ignoredFilenames = new Set([
    "bun.lock",
    "bun.lockb",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "CHANGELOG.md",
  ]);
  const ignoredDirectories = new Set([
    "coverage",
    "dist",
    ".blume",
    ".blume-verify",
    ".alchemy",
    "node_modules",
  ]);
  let changedLines = 0;
  for (const file of files) {
    const segments = file.filename.split("/");
    const basename = segments.at(-1) ?? "";
    const ignored =
      ignoredFilenames.has(basename) ||
      segments.some((segment) => ignoredDirectories.has(segment)) ||
      basename.endsWith(".snap") ||
      basename.endsWith(".tsbuildinfo");
    if (!ignored) {
      changedLines += file.additions + file.deletions;
    }
  }
  if (changedLines <= 10) {
    return "size/xs";
  }
  if (changedLines <= 100) {
    return "size/s";
  }
  if (changedLines <= 500) {
    return "size/m";
  }
  if (changedLines <= 1000) {
    return "size/l";
  }
  return "size/xl";
};

export const getRequiredChangesets = (filenames: string[]): Set<string> => {
  const required = new Set<string>();
  for (const filename of filenames) {
    if (
      filename.startsWith("packages/opencode-force-input/") &&
      meaningfulPackageFile(filename)
    ) {
      required.add("@mynameistito/opencode-force-input");
    }
    if (
      filename.startsWith("packages/opencode-usage-limits/") &&
      meaningfulPackageFile(filename)
    ) {
      required.add("@mynameistito/opencode-usage-limits");
    }
    if (
      filename.startsWith("apps/web/docs/") ||
      [
        "apps/web/alchemy.run.ts",
        "apps/web/blume.config.ts",
        "apps/web/theme.css",
      ].includes(filename)
    ) {
      required.add("@mynameistito/opencode-plugins-docs");
    }
  }
  return required;
};

export const getMissingChangesets = (
  requiredPackages: Iterable<string>,
  changesetPackages: Set<string>
): string[] =>
  [...requiredPackages].filter((name) => !changesetPackages.has(name));

interface LabelReconciliation {
  add: string[];
  remove: string[];
}

export const reconcileLabels = (
  currentLabels: string[],
  desiredLabels: Set<string>,
  managedLabels: Set<string>
): LabelReconciliation => {
  const add = [...desiredLabels].filter(
    (label) => !currentLabels.includes(label)
  );
  const remove = currentLabels.filter(
    (label) => managedLabels.has(label) && !desiredLabels.has(label)
  );
  return { add, remove };
};
