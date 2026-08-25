# Implementation Plans

This plan was generated on 2026-08-25 after surveying the empty destination directory and the two source repositories. Execute the plan in order. The destination GitHub repository `mynameistito/opencode-plugins` does not exist yet; the source snapshots are `oc-ctrl-enter-force-import@v2` at `06f1453` and `oc-usage-limits-plugin@opencode-v2` at `26d5723`.

## Execution Order & Status

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| 001 | Create the combined OpenCode plugins monorepo on `main` | P1 | L | — | DONE |

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED` with a one-line reason, or `REJECTED` with a one-line rationale.

## Dependency Notes

- The migration must be completed as one atomic repository bootstrap because both package manifests, the root workspace, Changesets configuration, lockfile, CI, release automation, and documentation must agree before pushing `main`.

## Implemented PR Stack

- PR #3: imported `oc-ctrl-enter-force-import@v2` into `packages/opencode-force-input`.
- PR #4: imported `oc-usage-limits-plugin@opencode-v2` and consolidated the root workspace/tooling.
- PR #5: added shared root CI/release workflows.
- PR #6: unified package release documentation around `main` and npm `latest`.
- PR #7: fixed Changesets Action input names after the first post-merge release run.

## Assumptions To Confirm Before Execution

- `main` will contain the exact requested v2 snapshots from both source branches, not stable `main` from either source repository.
- Both packages will initially be released from the new monorepo’s `main` as preview packages. Use one preview dist-tag, recommended as `next`, for the first coordinated release. Do not pretend that the old `beta` and `next` branch lanes remain independently publishable after consolidation unless a later branch-specific release design is added.
- The old npm package names will not be republished under the new repository. Existing old packages remain available for users, while the new names receive new-package releases. If redirects or deprecation notices are desired, handle them as a separate npm release task after the migration.
