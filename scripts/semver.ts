const serializedVersionPattern =
  /^"(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"$/u;

interface ParsedVersion {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: string[];
  value: string;
}

export const parseSerializedSemVer = (
  serialized: string,
  source: string
): ParsedVersion => {
  const match = serializedVersionPattern.exec(serialized);

  if (!match) {
    throw new TypeError(`${source} did not contain a valid package version`);
  }

  const { major, minor, patch, prerelease } = match.groups ?? {};

  if (!major || !minor || !patch) {
    throw new TypeError(`${source} did not contain a valid package version`);
  }

  return {
    major: BigInt(major),
    minor: BigInt(minor),
    patch: BigInt(patch),
    prerelease: prerelease?.split(".") ?? [],
    value: serialized.slice(1, -1),
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
    const rightIdentifier = right[index];

    if (rightIdentifier === undefined) {
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
  const parsedCandidate = parseSerializedSemVer(
    JSON.stringify(candidate) ?? "",
    "Candidate version"
  );
  const parsedCurrent = parseSerializedSemVer(
    JSON.stringify(current) ?? "",
    "Current version"
  );

  return compareVersions(parsedCandidate, parsedCurrent) > 0;
};
