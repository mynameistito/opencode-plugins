const versionPattern =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)/u;

const numericPrereleasePattern = /^(?:0|[1-9]\d*)$/u;

const alphanumericPrereleasePattern = /^\d*[A-Za-z-][\dA-Za-z-]*$/u;

const buildIdentifierPattern = /^[\dA-Za-z-]+$/u;

const invalidVersion = (source: string): never => {
  throw new TypeError(`${source} did not contain a valid package version`);
};

const isValidPrereleaseIdentifier = (identifier: string): boolean =>
  numericPrereleasePattern.test(identifier) ||
  alphanumericPrereleasePattern.test(identifier);

const parseSuffix = (suffix: string, source: string): string[] => {
  const separatorIndex = suffix.indexOf("+");
  const hasBuild = separatorIndex !== -1;
  const prereleasePart = hasBuild ? suffix.slice(0, separatorIndex) : suffix;
  const buildPart = hasBuild ? suffix.slice(separatorIndex + 1) : undefined;

  if (hasBuild && suffix.includes("+", separatorIndex + 1)) {
    return invalidVersion(source);
  }

  if (prereleasePart !== "" && !prereleasePart.startsWith("-")) {
    return invalidVersion(source);
  }

  if (hasBuild && !buildPart) {
    return invalidVersion(source);
  }

  const prerelease = prereleasePart.startsWith("-")
    ? prereleasePart.slice(1)
    : undefined;

  const identifiers = prerelease?.split(".") ?? [];
  const buildIdentifiers = buildPart?.split(".") ?? [];

  if (
    (prerelease !== undefined &&
      !identifiers.every(isValidPrereleaseIdentifier)) ||
    (buildPart !== undefined &&
      !buildIdentifiers.every((identifier) =>
        buildIdentifierPattern.test(identifier)
      ))
  ) {
    return invalidVersion(source);
  }

  return identifiers;
};

interface ParsedVersion {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: string[];
  value: string;
}

export const parseSemVer = (value: string, source: string): ParsedVersion => {
  const versionMatch = versionPattern.exec(value);
  const { major, minor, patch } = versionMatch?.groups ?? {};

  if (!major || !minor || !patch || !versionMatch) {
    return invalidVersion(source);
  }

  const prereleaseIdentifiers = parseSuffix(
    value.slice(versionMatch[0].length),
    source
  );

  return {
    major: BigInt(major),
    minor: BigInt(minor),
    patch: BigInt(patch),
    prerelease: prereleaseIdentifiers,
    value,
  };
};

const compareBigInts = (left: bigint, right: bigint): number => {
  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
};

const compareCoreVersions = (
  left: ParsedVersion,
  right: ParsedVersion
): number => {
  for (const key of ["major", "minor", "patch"] as const) {
    if (left[key] !== right[key]) {
      return compareBigInts(left[key], right[key]);
    }
  }

  return 0;
};

const comparePrereleaseIdentifier = (left: string, right: string): number => {
  const leftIsNumeric = /^\d+$/u.test(left);
  const rightIsNumeric = /^\d+$/u.test(right);

  if (leftIsNumeric && rightIsNumeric) {
    return compareBigInts(BigInt(left), BigInt(right));
  }

  if (leftIsNumeric !== rightIsNumeric) {
    return leftIsNumeric ? -1 : 1;
  }

  if (left === right) {
    return 0;
  }

  return left > right ? 1 : -1;
};

const comparePrerelease = (left: string[], right: string[]): number => {
  for (const [index, leftIdentifier] of left.entries()) {
    const rightIdentifier = right[index] ?? null;

    if (rightIdentifier === null) {
      return 1;
    }

    const comparison = comparePrereleaseIdentifier(
      leftIdentifier,
      rightIdentifier
    );

    if (comparison !== 0) {
      return comparison;
    }
  }

  return left.length === right.length ? 0 : -1;
};

const compareVersions = (left: ParsedVersion, right: ParsedVersion): number => {
  const coreComparison = compareCoreVersions(left, right);

  if (coreComparison !== 0) {
    return coreComparison;
  }

  const leftIsRelease = left.prerelease.length === 0;
  const rightIsRelease = right.prerelease.length === 0;

  if (leftIsRelease !== rightIsRelease) {
    return leftIsRelease ? 1 : -1;
  }

  return comparePrerelease(left.prerelease, right.prerelease);
};

export const isNewerSemVer = (candidate: string, current: string): boolean => {
  const parsedCandidate = parseSemVer(candidate, "Candidate version");
  const parsedCurrent = parseSemVer(current, "Current version");

  return compareVersions(parsedCandidate, parsedCurrent) > 0;
};
