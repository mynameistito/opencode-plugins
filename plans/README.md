# Implementation Plans

Generated on 2026-08-31 against commit `a368bf0`. Execute in the order below. Each executor must read its complete plan, honor its STOP conditions, and update the status row when finished.

## Execution Order & Status

| Plan | Title | Priority | Effort | Depends on | Status |
| --- | --- | --- | --- | --- | --- |
| 001 | Consolidate the Qwen provider path | P1 | S | - | TODO |
| 002 | Share optional provider auth-file loading | P2 | M | - | TODO |
| 003 | Remove orphaned usage-limits surfaces | P2 | S | - | DONE |
| 004 | Align the public config schema with runtime validation | P1 | M | - | TODO |
| 005 | Pin analysis and release executables | P2 | S | - | DONE |
| 006 | Document Qwen footer and CLI requirements | P3 | S | 001 | TODO |

Status values: TODO | IN PROGRESS | DONE | BLOCKED (with a one-line reason) | REJECTED (with rationale).

## Dependency Notes

- Plan 001 must add direct coverage for the production Qwen Effect adapter before deleting or redirecting the legacy Promise adapter.
- Plan 006 depends on Plan 001 so the README describes the surviving Qwen API and runtime behavior.
- Plans 002 through 005 are independent and can be implemented in parallel worktrees.

## Findings Considered And Rejected

- The low-severity transitive `@babel/core` audit advisory was not planned: it is a development transitive dependency and no reachable production path was established.
- Long provider comments were not planned for removal: they document provider-specific API behavior and credential precedence rather than repeating the code.
