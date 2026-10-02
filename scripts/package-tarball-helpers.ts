const isUnexpectedRootFile = (filePath: string): boolean => {
  if (filePath.includes("/")) {
    return false;
  }
  return (
    ["build", "script", "scripts", "test"].some(
      (prefix) => filePath === prefix || filePath.startsWith(`${prefix}.`)
    ) ||
    filePath.startsWith("test-") ||
    /\.(?:test|spec)\.[^/.]+$/u.test(filePath)
  );
};

/**
 * Identify package paths that should not be included in the published tarball.
 *
 * @param filePath - A path reported by `npm pack --dry-run`.
 * @returns Whether the path belongs to an excluded source directory or is a root-level test/script file.
 */
export const isUnexpectedPackagePath = (filePath: string): boolean =>
  /^(?:src|__tests__|scripts|coverage|node_modules)\//u.test(filePath) ||
  isUnexpectedRootFile(filePath);
