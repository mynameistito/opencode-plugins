# GitHub repository configuration

This directory contains GitHub Actions workflows, automation scripts, repository templates, and configuration used to maintain this repository.

## Workflows

| Workflow | Purpose | Trigger |
| --- | --- | --- |
| [`ci.yml`](workflows/ci.yml) | Runs typechecking, lint/check, tests, package tests, build, and Knip. | Pull requests and pushes to `main` |
| [`deploy-preview.yml`](workflows/deploy-preview.yml) | Deploys documentation previews and cleans them up when pull requests close. | CI completion and pull request closure |
| [`deploy.yml`](workflows/deploy.yml) | Deploys production documentation after a release workflow completes. | Release workflow completion |
| [`link-check.yml`](workflows/link-check.yml) | Checks documentation links. | Relevant pull requests, weekly schedule, or manual dispatch |
| [`pr-metadata.yml`](workflows/pr-metadata.yml) | Applies managed pull request labels and checks Changeset coverage. | Pull request activity |
| [`release.yml`](workflows/release.yml) | Verifies packages and runs the Changesets release/publish flow. | Pushes to `main` or manual dispatch |
| [`update-opencode-plugin.yml`](workflows/update-opencode-plugin.yml) | Checks for a newer `@opencode/plugin` and opens or updates its pull request. | Manual dispatch |
| [`workflow-security.yml`](workflows/workflow-security.yml) | Scans workflow and automation changes for security issues. | Relevant pull requests, pushes to `main`, or schedule |

## Workflow scripts

Workflow-specific TypeScript entrypoints live in [`scripts/`](scripts/) so their implementation sits beside the workflows that call them. Workflows invoke them with Bun; scripts use Node standard APIs and launch npm through the explicitly configured Node executable where needed.

| Script | Purpose | Used by |
| --- | --- | --- |
| [`create-git-tag.ts`](scripts/create-git-tag.ts) | Publishes release tags after Changesets publishing. | `release.yml` |
| [`create-signed-github-commit.ts`](scripts/create-signed-github-commit.ts) | Creates a verified GitHub commit for the plugin update. | `update-opencode-plugin.yml` |
| [`get-version-pr-title.ts`](scripts/get-version-pr-title.ts) | Produces the release pull request title. | `release.yml` |
| [`pr-metadata-helpers.ts`](scripts/pr-metadata-helpers.ts) | Pure helpers for PR labels and Changeset coverage. | `update-pr-metadata.ts` and tests |
| [`semver.ts`](scripts/semver.ts) | Parses and compares serialized semantic versions. | `update-opencode-plugin.ts` and tests |
| [`stage-packages.ts`](scripts/stage-packages.ts) | Stages workspace packages for release publishing. | `release.yml` |
| [`update-opencode-plugin.ts`](scripts/update-opencode-plugin.ts) | Checks for and reports a newer `@opencode/plugin` version. | `update-opencode-plugin.yml` |
| [`update-pr-metadata.ts`](scripts/update-pr-metadata.ts) | Reconciles PR labels and validates Changeset coverage. | `pr-metadata.yml` |

## Other GitHub files

| Path | Purpose |
| --- | --- |
| [`ISSUE_TEMPLATE/`](ISSUE_TEMPLATE/) | Bug report and feature request forms, plus shared issue-template configuration. |
| [`dependabot.yml`](dependabot.yml) | Weekly dependency update configuration for Bun and GitHub Actions. |
| [`pull_request_template.md`](pull_request_template.md) | Pull request summary, compatibility, validation, and release checklist. |
| [`zizmor.yml`](zizmor.yml) | Line-specific ignores for intentionally reviewed workflow-security findings. |
