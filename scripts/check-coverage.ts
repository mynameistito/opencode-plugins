const [coveragePath, thresholdText] = process.argv.slice(2);
const threshold = Number(thresholdText);

if (!coveragePath || !Number.isFinite(threshold)) {
  throw new Error(
    "Usage: bun scripts/check-coverage.ts <lcov-path> <threshold>"
  );
}

const report = await Bun.file(coveragePath).text();
const hits = [...report.matchAll(/^DA:\d+,(?<hits>\d+)$/gmu)].map((match) =>
  Number(match.groups?.hits)
);
const covered = hits.filter((hit) => hit > 0).length;
const coverage = hits.length === 0 ? 0 : covered / hits.length;

if (coverage < threshold) {
  throw new Error(
    `Line coverage ${(coverage * 100).toFixed(2)}% is below ${(threshold * 100).toFixed(2)}%`
  );
}

console.log(`Line coverage ${(coverage * 100).toFixed(2)}% meets target.`);
