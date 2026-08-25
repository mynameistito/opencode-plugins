# Plan 001: Create the Combined OpenCode Plugins Monorepo on `main`

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the STOP conditions occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: the destination directory has no Git commit. Verify that the two source tips still resolve to `06f1453` for `oc-ctrl-enter-force-import` branch `v2` and `26d5723` for `oc-usage-limits-plugin` branch `opencode-v2`. If either tip changed, re-survey the source branch before proceeding.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: migration
- **Planned at**: source commits `06f1453` and `26d5723`, 2026-08-25
- **Implemented**: PRs #3, #4, #5, #6, and #7 on `main`

## Why This Matters

The two plugins currently live in separate repositories with separate release workflows, package names, lockfiles, and Changesets state. A workspace monorepo will give them one contribution surface, one Ultracite policy, one CI entrypoint, and coordinated package versioning while preserving each plugin as an independently publishable npm package. The migration must also avoid accidentally combining stable OpenCode code with v2 code or leaving stale package names in install instructions, package metadata, Changesets, schema URLs, release automation, and runtime identifiers.

## Current State

The destination `C:\Users\mynameistito\code\opencode-plugins` is empty and is not currently a Git repository. The destination GitHub repository lookup for `mynameistito/opencode-plugins` returns not found.

Source inputs:

- `C:\Users\mynameistito\code\oc-ctrl-enter-force-import` branch `v2`, commit `06f1453` — a TypeScript/TUI plugin with root `index.ts` and `tui.tsx`, two build entries, package name `@mynameistito/oc-ctrl-enter-force-import`, and v2 Changesets prerelease tag `beta`.
- `C:\Users\mynameistito\code\oc-usage-limits-plugin` branch `opencode-v2`, commit `26d5723` — a TypeScript/TUI plugin under `src/`, package name `oc-usage-limits-plugin`, schema/examples, and v2 Changesets prerelease tag `next`.

Relevant source conventions:

- Both packages use Bun, `bun test`, `tsc --noEmit`, `tsdown`, Changesets, and Ultracite. Existing package scripts are the authoritative behavior to preserve: see each source `package.json`.
- The package toolchains are similar but their build entrypoints are not uniform today: force-input uses `tsdown.config.ts` with `index.ts` and `tui.tsx` entries, while usage-limits uses `tsdown.config.ts` with `src/index.ts` and declaration output. Both use OpenTUI Solid JSX, but neither currently uses the proposed Kit-style `Bun.build` runner.
- Shared development tooling should live in the private root `package.json`: `ultracite`, `@changesets/cli`, `typescript`, `@types/node`, `@types/bun`, `tsdown`, `oxfmt`, `oxlint`, `lefthook`, and any shared lint/build tooling whose versions are compatible across both workspaces. Package manifests should not duplicate these tools. Package manifests must retain their own published `dependencies`, `peerDependencies`, `optionalDependencies`, package-specific `files`/`exports`, and any dependency required when npm installs the package outside this workspace.
- Tests belong in `__tests__/`, as shown by both repositories and the usage-limits `AGENTS.md`.
- Builds publish only `dist` plus package-specific documentation/assets through each manifest’s `files` list.
- Existing package CI runs `typecheck`, `check`, `test`, `test:package`, `build`, and `knip`; retain all six checks, but run them for both workspaces from one root workflow.
- Existing release workflows use Changesets and npm staged publishing. They are branch-specific today: force-input uses `main`/`v2` with `latest`/`beta`, while usage-limits uses `main`/`opencode-v2` with `latest`/`next`. This plan deliberately changes that model because the requested destination `main` is a combined v2 snapshot.
- The source repositories also contain duplicate `scripts/changeset-add.ts` helpers. These should become one root helper. `scripts/test-package.ts` is package-specific smoke-test logic and should remain package-local unless it can be made data-driven without losing export assertions. Usage-limits `scripts/release-guard.ts` only enforces the old `opencode-v2` branch, `2.0.0-next.N` version pattern, and `next` tag; it is obsolete once the packages release from the combined `main`, so remove it and its dedicated test rather than carrying that branch policy forward.

Names that must change everywhere in tracked files:

- `@mynameistito/oc-ctrl-enter-force-import` becomes `@mynameistito/opencode-force-input`.
- `oc-usage-limits-plugin` becomes `@mynameistito/opencode-usage-limits`.
- Repository URLs, issue URLs, README headings, install commands, cache paths, schema URLs, Changesets frontmatter, release titles, and workflow package-name variables must point at `mynameistito/opencode-plugins` or the new npm package name as appropriate.
- The force-input internal runtime/plugin ID currently contains `mynameistito.oc-ctrl-enter-force-import` in `index.ts`, `tui.tsx`, and `scripts/test-package.ts`. Decide deliberately whether the runtime ID is a persisted public identifier. Recommended migration: use `mynameistito.opencode-force-input` in the new package and update package tests; document that this is an internal ID change. Do not silently retain the old ID unless compatibility with persisted OpenCode state is confirmed.

## Commands You Will Need

Run commands from `C:\Users\mynameistito\code\opencode-plugins` unless a command explicitly names a source directory.

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Verify source tips | `git -C C:\Users\mynameistito\code\oc-ctrl-enter-force-import rev-parse v2` and `git -C C:\Users\mynameistito\code\oc-usage-limits-plugin rev-parse opencode-v2` | Expected commits `06f1453...` and `26d5723...` |
| Create repository | `git init -b main` | Exit 0; current branch is `main` |
| Install workspace | `bun install` | Exit 0 and creates a root `bun.lock` |
| Root checks | `bun run typecheck`, `bun run check`, `bun test`, `bun run build`, `bun run test:package`, `bun run knip` | Exit 0 for both packages; no missing workspace or stale-name errors |
| Search old names | `rg -n --hidden --glob '!node_modules/**' --glob '!dist/**' 'oc-ctrl-enter-force-import|oc-usage-limits-plugin' .` | No matches except an explicitly documented migration note, if one is intentionally retained |
| Validate Changesets | `bunx changeset status` | Both workspace package names resolve and no malformed frontmatter is reported |
| Inspect package tarballs | `npm pack --dry-run --workspace packages/opencode-force-input` and the equivalent usage package command | Only intended files are included and names are the new scoped names |
| Verify remote | `gh repo view mynameistito/opencode-plugins --json nameWithOwner,defaultBranchRef` | Repository exists and default branch is `main` |

Use `bun` for dependency installation and package scripts. npm is only needed for the existing publish/pack behavior and the npm registry.

## Scope

**In scope (the only destination files/directories to create or modify):**

- `package.json`, `bun.lock`, `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `.gitignore`, and any root workspace/tooling config required by the selected Bun/Ultracite setup.
- Root `scripts/**` for shared task orchestration/build entrypoints. Duplicate package-local Changeset helpers are not in scope after the root helper is wired.
- `packages/opencode-force-input/**` — the complete contents of source `oc-ctrl-enter-force-import@v2`, relocated without `node_modules` or generated `dist` artifacts, then updated for the new package/repository identity.
- `packages/opencode-usage-limits/**` — the complete contents of source `oc-usage-limits-plugin@opencode-v2`, relocated without `node_modules` or generated `dist` artifacts, then updated for the new package/repository identity.
- Root `.changeset/**`, with all pending Changesets translated to the two new package names and a single root config with `baseBranch: "main"`.
- Root `.github/workflows/ci.yml`, `.github/workflows/release.yml`, and other root-level community/automation files selected after comparing both source repositories.
- Git history, the new GitHub repository, the destination `main` branch, and tags only as specified in the Git workflow below.

**Out of scope:**

- Source repositories, their branches, tags, releases, npm packages, or GitHub settings other than adding a deprecation/redirect notice as a separately approved follow-up.
- `node_modules`, checked-in generated `dist` files, build caches, or local editor state.
- New shared runtime libraries or refactors between plugins. This migration is organizational and identity-focused.
- Stable OpenCode compatibility changes. The requested inputs are both v2 branches.
- Publishing an npm package or deleting the old repositories until the new repository passes validation and the operator explicitly approves publication.

## Git Workflow

1. Before modifying the destination, make read-only backups or fresh clones of both source repositories outside the destination. Do not use the dirty working copies as the only migration source.
2. Preserve history using a Git subtree-style import, not a file copy followed by one opaque commit. The recommended sequence is to create a temporary clone of the destination, add each source as a remote, fetch only the requested branch, and import each branch under a temporary prefix before moving its files into `packages/opencode-force-input` and `packages/opencode-usage-limits`. If the chosen import method cannot preserve commit ancestry cleanly, STOP and report rather than replacing it with an unreviewed history rewrite.
3. Resolve root-file collisions manually. There must be exactly one root `.github`, `.changeset`, lockfile, contributor guide, and license policy. Keep package-specific workflows/configuration inside each package only if the final CI/release design actually consumes them; otherwise consolidate them at root.
4. Commit in logical units using Conventional Commits, matching source history examples such as `chore: ...`, `fix: ...`, and `feat: ...`. Recommended commits: repository/workspace skeleton, force-input relocation and rename, usage-limits relocation and rename, root tooling/CI, release/docs cleanup.
5. Create `mynameistito/opencode-plugins` only after the local repository is validated: `gh repo create mynameistito/opencode-plugins --public --source . --remote origin --push`. If the repository exists by then, STOP and inspect it before using `--push`.
6. Confirm `origin/main` contains the combined commit and set the GitHub default branch to `main` if the repository creation flow did not already do so. Do not force-push. Do not delete source branches or repositories.

## Steps

### Step 1: Freeze and verify the source snapshots

Fetch the two source repositories into temporary read-only clones, verify clean source snapshots, and confirm the requested branch tips. Record the full commit IDs in the migration notes or commit message, but never copy source `node_modules` or generated `dist` into the monorepo.

**Verify**: the two `rev-parse` commands from the command table resolve to the expected prefixes; `git status --short` is empty in the temporary clones; `git ls-tree -d v2` and `git ls-tree -d opencode-v2` show the expected project trees.

### Step 2: Build the workspace skeleton and import both histories

Create `packages/opencode-force-input` and `packages/opencode-usage-limits`. Import the force-input `v2` tree and usage-limits `opencode-v2` tree into those directories while preserving their commit ancestry as far as the selected subtree import supports. Remove nested `.git` metadata, `node_modules`, generated `dist`, and source-only repository workflows that would run against the wrong paths. Keep package tests, source, examples, licenses, schemas, and package-local configuration.

Create a private root `package.json` with Bun workspaces covering `packages/*`. Move compatible development-only tooling to the root: `ultracite`, `@changesets/cli`, `typescript`, Bun/Node type packages, `tsdown`, `oxfmt`, `oxlint`, `lefthook`, and shared tooling dependencies. Resolve versions once at the root rather than keeping the currently differing package-local versions. Keep runtime and published consumer requirements in each package manifest: for example `@opencode-ai/plugin`, `effect`, and OpenTUI/Solid peer dependencies must remain package metadata where the package requires them at install/runtime. Do not move a dependency to the root merely because the workspace can resolve it; check the packed package and npm consumer behavior.

Use one root task runner under `scripts/` to enumerate the two workspaces and invoke their package-local implementation commands. The root commands should be the contributor/CI interface (`bun run build`, `bun run typecheck`, `bun run check`, `bun test`, `bun run test:package`, and `bun run knip`). Package manifests may retain short implementation scripts such as `build: tsdown`, but the executable should resolve from the root workspace installation and must not be duplicated in both manifests.

Create one root `scripts/changeset-add.ts` that finds the workspace package from an explicit package selector or validates an explicit package name, then writes Changeset frontmatter for that package. Delete the duplicated package-local `scripts/changeset-add.ts` files and update documentation to call the root helper. Move shared `tsconfig`, Ultracite, Oxfmt, and Oxlint configuration to the root where the tools support workspace-wide configuration; retain package-local config only for genuine package-specific entrypoints or exclusions. Keep `scripts/test-package.ts` inside each package because its assertions inspect that package’s own exports and runtime identity. Delete usage-limits `scripts/release-guard.ts` and `__tests__/release-guard.test.ts`; their old branch/tag/version assertions are no longer relevant to the combined repository.

**Verify**: `git status --short` shows only intended workspace files; `git log --all -- packages/opencode-force-input` and `git log --all -- packages/opencode-usage-limits` show imported source history; `bun install` exits 0 and creates one root lockfile; `bun pm ls`/package manifests show shared tools installed once at the root and consumer-facing dependencies still declared in each package.

### Step 3: Rename package identities and repository references

Update both package manifests, package-local README/docs, changelogs, examples, schema IDs, scripts, workflows, and tests. Replace the exact old package names with the requested new names and repository URLs with `https://github.com/mynameistito/opencode-plugins`. Update the force-input runtime ID to `mynameistito.opencode-force-input` only after checking its use in OpenCode v2 and its package tests. Update all install/configuration examples to use the new scoped names and the new `/tui` export paths.

Do not rewrite historical prose merely to erase the fact that a package was previously named differently; if an old name is retained in a changelog migration note, make it explicit and exclude only that deliberate historical occurrence from the stale-name gate.

**Verify**: the old-name `rg` command returns no accidental matches; `rg -n '@mynameistito/opencode-force-input|@mynameistito/opencode-usage-limits|github.com/mynameistito/opencode-plugins' packages README.md .github .changeset` finds all expected identity references; package manifests report exactly the two requested names.

### Step 4: Consolidate Changesets and version state

Move all applicable pending Changesets into the root `.changeset` directory. Rewrite frontmatter package keys from the two old names to the two new names, preserving bump levels and release notes. Merge the two configs into one root config with `access: "public"`, `baseBranch: "main"`, and the existing public changelog behavior. Do not carry two conflicting `.changeset/pre.json` files or two prerelease modes into the combined root.

Because the source branches have different prerelease tags (`beta` and `next`), choose one coordinated initial tag, recommended `next`, and document it in the root README and release workflow. Before running `changeset version`, inspect whether the imported pending Changesets describe already-published versions; if they do, STOP and reconcile versions rather than generating duplicate releases.

**Verify**: `bunx changeset status` exits 0; it lists only `@mynameistito/opencode-force-input` and `@mynameistito/opencode-usage-limits`; no Changeset file references either old name; no conflicting prerelease metadata remains.

### Step 5: Replace per-repository automation with root monorepo automation

Create one root CI workflow triggered by pull requests and pushes to `main`. Install Bun once, run the root workspace install with the committed lockfile, and execute typecheck, Ultracite check, tests, package tests, builds, knip, and `bunx changeset status` for both workspaces. Changeset presence/quality and package validation belong in normal PR CI; do not add a manual release guard or branch-specific release test. Ensure generated build output is not required to be committed.

Create one root release workflow using Changesets at repository root. Its first release lane should stage/publish both packages from `main` using the coordinated preview tag selected in Step 4. The workflow must derive package names and versions from workspace manifests rather than hard-coding old names. Preserve OIDC/npm provenance requirements and GitHub release creation, but make release notes package-aware. Do not use the old branch conditions for `v2` or `opencode-v2` in the combined `main` workflow.

Add path-aware CI only if it does not skip the root lockfile, Changesets, or release configuration checks. A change to root tooling must validate both packages.

**Verify**: parse workflow YAML; `rg` finds no old branch-specific release conditions or old package names; run every root validation script locally and inspect that each package is included in the output; `rg -n 'scripts/changeset-add|scripts/release-guard|release-guard' .github package.json README.md CONTRIBUTING.md AGENTS.md packages` finds only the root Changeset helper and no release-guard references.

### Step 5a: Standardize build orchestration without prematurely replacing `tsdown`

Add a root build runner that calls each package’s `build` script from the workspace root and fails with the package name when a build fails. This gives the monorepo a uniform `bun run build` entrypoint while allowing each package to retain the build configuration required by its public exports and declaration files.

Evaluate the proposed Kit-style `Bun.build` implementation as an experiment, not as an automatic replacement. It is relevant because both packages use Bun and OpenTUI Solid JSX, and a shared runner could eventually remove duplicate `tsdown` configuration. It is not drop-in compatible with the current source: force-input has two public entrypoints (`.` and `./tui`) at `index.ts` and `tui.tsx`, usage-limits has `src/index.ts`, and the proposed script does not emit TypeScript declarations. The current manifests explicitly publish `types` files, so replacing `tsdown` would require an intentional declaration-generation strategy and equivalent export/package smoke tests.

If the experiment is attempted, create a temporary or opt-in root script that supports an explicit package descriptor containing entrypoints, output directory, Solid transform requirement, externals, and declaration generation. Compare its output and tarball contents against `tsdown`; do not merge it as the default builder unless both packages produce equivalent ESM, declarations, source maps, exports, and runtime behavior. The default migration path is therefore: shared root orchestration now, shared Bun builder only in a follow-up once equivalence is demonstrated.

**Verify**: `bun run build` builds both packages; each package still contains the declaration files named by its `exports`/`types` fields; `npm pack --dry-run` shows equivalent publishable output before and after any build experiment; no package’s public entrypoint disappears.

### Step 6: Write the monorepo documentation and contributor policy

Create a root README that explains the repository, lists both packages and their new npm names, links to each package README, documents the v2/OpenCode compatibility assumption, and gives install examples. Explain that Changesets are created at the root and that releases are coordinated from `main`. Add concise root `AGENTS.md` and `CONTRIBUTING.md` instructions covering Bun, package locations, tests under `__tests__/`, Ultracite, and Changesets. Update package README headings and links so users can navigate from npm to the monorepo.

Document the release decision clearly: the old source branch names are historical inputs; the new repository’s supported integration branch is `main` unless a future release-lane design introduces additional branches.

**Verify**: follow every install command in the docs far enough to confirm the package spec and `/tui` export are correct; `rg` confirms no stale repository URLs or unscoped package install commands remain.

### Step 7: Validate, review the diff, and publish `main`

Run the complete command table. Review `git diff --stat`, `git diff --check`, the package manifests, root workflows, Changesets, and the published-file lists. Inspect both dry-run tarballs and verify they contain no secrets, `node_modules`, source-only files, or unintended generated artifacts. Confirm `git status` contains only intentional files, then commit the migration and push the new repository’s `main`.

After pushing, verify the GitHub repository default branch, Actions workflow files, package paths, and commit ancestry through the GitHub API/CLI. Do not publish to npm in this step unless explicitly approved after the remote verification.

**Verify**: all root checks exit 0; `git diff --check` is clean; `gh repo view mynameistito/opencode-plugins --json nameWithOwner,defaultBranchRef` reports `main`; `git ls-remote origin refs/heads/main` returns the pushed commit.

## Test Plan

- Run the existing force-input tests from `packages/opencode-force-input/__tests__/`, especially the package test that checks both server and TUI entrypoints and the new runtime ID.
- Run all usage-limits tests from `packages/opencode-usage-limits/__tests__/`, including providers, runtime boundaries, config/schema behavior, release guard, and package loading.
- Run both package `typecheck`, `check`, `build`, `test`, `test:package`, and `knip` tasks through root scripts.
- Run the root Changeset helper once for each package in a temporary validation branch and confirm the generated frontmatter names the selected scoped package; remove those temporary Changesets afterward.
- Test package metadata with `npm pack --dry-run` for each workspace and confirm the new scoped names, exports, `files` lists, and schema asset are correct.
- Run `bunx changeset status` after the name rewrite and before any release versioning.

## Done Criteria

- [ ] `main` contains both requested source snapshots under `packages/` with source history preserved as far as the import method permits.
- [ ] `packages/opencode-force-input/package.json` has name `@mynameistito/opencode-force-input`.
- [ ] `packages/opencode-usage-limits/package.json` has name `@mynameistito/opencode-usage-limits`.
- [ ] Root Bun workspaces, one lockfile, Changesets, and Ultracite checks are configured.
- [ ] Shared root Changesets helper and task/build orchestration replace duplicate repository-level helpers; only package-specific smoke/release scripts remain where justified.
- [ ] Obsolete `release-guard.ts` logic and its dedicated tests are removed; PR correctness is covered by normal CI, Changesets status, and package smoke tests.
- [ ] Ultracite, Changesets CLI, TypeScript, formatter/linter, build, and hook tooling are declared once in the root `package.json`; package manifests retain only package-specific and publish/runtime dependency metadata.
- [ ] Root CI validates both packages and root release automation is monorepo-aware.
- [ ] Existing tests and package smoke tests pass for both packages.
- [ ] The stale-name search returns no accidental matches.
- [ ] `git diff --check` is clean and no generated `dist`/`node_modules` files are committed.
- [ ] `mynameistito/opencode-plugins` exists on GitHub with default branch `main`, and `origin/main` contains the migration commit.
- [ ] No npm publish or source repository deletion occurs without explicit approval.
- [ ] `plans/README.md` status row is updated to `DONE`.

## STOP Conditions

Stop and report instead of improvising if:

- Either source branch no longer resolves to the planned commit, or the source working tree contains uncommitted changes that would be required for the requested result.
- `mynameistito/opencode-plugins` already exists, has content, or has a non-`main` default branch when the executor reaches repository creation.
- A subtree/history import would overwrite the other package’s files or cannot distinguish root collisions safely.
- A pending Changeset or prerelease state refers to a version already published under the old or new package name and the correct migration behavior is unclear.
- OpenCode v2 treats the force-input runtime ID as persisted state and changing it would break installed users; report the evidence and ask whether to retain the old ID.
- A root workspace script cannot execute both packages without adding an out-of-scope dependency or changing plugin runtime behavior.
- Any validation command fails twice after a reasonable, in-scope fix attempt.
- Publishing, deleting repositories, force-pushing, or changing GitHub branch protection appears necessary; request explicit approval.

## Maintenance Notes

- Future changes must add Changesets at the monorepo root and name exactly one of the two scoped workspace packages.
- Root CI/release files are shared infrastructure; changes to them must be tested against both packages, even when only one package changed.
- Keep OpenCode host compatibility explicit in each package README. The current migration inputs are v2 code and should not be advertised as stable OpenCode-compatible without a separate compatibility validation.
- Reviewers should scrutinize package exports, npm `files`, schema URLs, runtime IDs, Changesets package keys, release tags, and workflow working directories; these are the highest-risk migration surfaces.
- Deferred follow-ups: stable OpenCode branches, old-package npm deprecation/redirect releases, independent `beta` versus `next` lanes, and repository archival. Each requires a product/release decision after the combined `main` has been validated.
