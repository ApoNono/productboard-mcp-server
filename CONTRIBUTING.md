# Contributing to this fork

> **This file applies to the `ApoNono/productboard-mcp-server` fork** (maintained for the Unifyr product team) — not the upstream `miguelarios/productboard-mcp-server`. If you intend to contribute upstream, see the upstream project's conventions.

This document captures the conventions for landing changes in the fork. The conventions are deliberately lightweight: the goal is "consistent enough that diffs are easy to review and revert," not bureaucracy. Read it once, refer back when in doubt.

If you're using an AI coding assistant (Claude Code, Cursor, etc.), feed it this file alongside `CLAUDE.md` before you start.

---

## Before you start a change

1. **Sync `main` first.** A stale base is the most common cause of merge friction.
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Skim recent commits** with `git log --oneline -10` to see the style and what's recently changed.

3. **Read [`CLAUDE.md`](./CLAUDE.md)** — it documents the project architecture, key patterns, and tool registration system. Worth 5 minutes before any non-trivial change.

4. **If you're touching Productboard API behavior**, verify the endpoint and parameter names by `curl`-ing the API directly first. Productboard silently ignores unknown query params (we have a history of bugs caused by snake_case-vs-camelCase mismatches), so don't trust your prior or an LLM's guess about an endpoint shape — confirm it with a real request.

## Branch naming

Use a topic-branch-per-change pattern, with a slash-separated prefix:

| Prefix | When |
|---|---|
| `fix/<scope>-<short-name>` | Bug fixes — e.g. `fix/notes-camelcase-params`, `fix/cache-undefined-on-miss` |
| `feat/<scope>` | New features or tools — e.g. `feat/initiatives`, `feat/teams` |
| `docs/<short-name>` | Documentation-only changes — e.g. `docs/contributing-guide` |
| `chore/<short-name>` | Dependency bumps, tooling, repo hygiene |

Never push directly to `main`. Open a PR even for trivial changes — it leaves a paper trail and gives the maintainer a chance to tag a release if appropriate.

## Commits

Use the **conventional commits** format: `<type>(<scope>): <short summary>`. We've been using `fix`, `feat`, `docs`, `chore`, `refactor`. Scope is the tool family or area: `notes`, `cache`, `auth`, `products`, etc. Examples from the existing history:

```
fix(cache): treat lru-cache undefined returns as cache miss
fix(notes): use Productboard's actual query param names and search endpoint
feat(initiatives): add 6 tools for the /initiatives Productboard resource
docs: bump fork note to v1.0.4-fork (initiative tools)
```

### Commit message body

After the title, leave a blank line, then include:

1. **Why** the change was needed (the symptom or the use case)
2. **What** changed at a high level (don't restate the diff)
3. **A "Verified" section** listing what you actually tested end-to-end vs what's speculative. This is the most-skipped section and the most-valuable for reviewers. Example:

```
Verified end-to-end:
- pb_initiative_list returns 5 real initiatives with status/owner/timeframe
- pb_initiative_get returns the full initiative shape

Not verified (would create real data in the test workspace):
- pb_initiative_create  — body mirrors GET response shape
- pb_initiative_update  — partial-update PATCH semantics
```

4. **`Co-Authored-By:` trailer** if you used AI assistance. Example:
   ```
   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   ```

### Breaking changes

If you remove or rename a tool input parameter, change a tool's permission requirements, or alter behavior that existing callers depend on, **flag it explicitly in the commit body**:

```
BREAKING: pb_feature_create no longer accepts `status` or `priority`.
The v2 /entities endpoint sets these via separate PATCH calls; callers
that previously passed these params will get a validation error.
```

This is non-negotiable for tool schema changes — the schema is the public API.

## One logical change per PR

The reviewer should be able to summarize the PR in one sentence. If you can't, it's probably two PRs. Examples of "one logical change":

- ✅ Migrate `pb_feature_create` to the v2 API
- ✅ Add `pb_team_list` tool (new resource)
- ✅ Fix Windows path separator bug in `scripts/fix-imports.js`
- ❌ All three of the above bundled together

Unrelated drive-by fixes you stumble across while doing your main work belong in a separate PR. If they're truly tiny (one-line), open the second PR right after the first.

## Pull requests

1. **Title**: same as the commit title for single-commit PRs.
2. **Body**:
   - Restate the why/what from the commit body if the commit body is short
   - Add a "How I verified" section if more verification context is useful than fits in the commit
   - Link to any related issues (`Closes #N`, `Refs #N`)
3. **Self-review the diff** in the GitHub PR view before requesting review. You'll catch ~half the things a reviewer would flag.
4. **Wait for review** before merging unless explicitly told otherwise by the maintainer. Merge style is **"Create a merge commit"** (no squash) to preserve individual fix history.

## Releases and tagging

The maintainer (currently @ApoNono) cuts releases. Don't tag versions yourself — just merge your PR and let the maintainer bump the README fork-note and tag `v1.0.X-fork` afterwards.

If your change is significant enough that users need to update (`git fetch --tags && git checkout vX.Y.Z-fork`), say so in the PR description so the maintainer knows to cut a new tag.

## Code conventions

These come from the existing codebase — match them in new code.

- **TypeScript**, ESM modules. Imports use `.js` extensions even for `.ts` files (ESM requirement).
- **Path aliases**: `@auth/`, `@api/`, `@core/`, `@tools/`, `@middleware/`, `@utils/` — use them in new code.
- **Tool classes** extend `BaseTool<TParams>` and implement `executeInternal`. Return `ToolExecutionResult` (`{success, data}` or `{success, error}`); BaseTool wraps it into MCP format.
- **Permissions**: every new tool declares `requiredPermissions` and `minimumAccessLevel` in its `permissionMetadata`. If you add a new resource (e.g. teams), add the matching enum entries in `src/auth/permissions.ts` AND grant them in `PermissionDiscoveryService.grantFullPermissions()`, otherwise bearer-auth users won't see the tool.
- **Registration**: tools are auto-discovered via `src/tools/index.ts` re-exports. Add your new module's index to that file.
- **Productboard API conventions**: queries are **camelCase** (`pageLimit`, `createdFrom`, `featureId` — not `page_limit`, `created_from`, `feature_id`). Productboard silently ignores misspellings, so wrong param names produce no errors, just empty filters. Always verify with a real `curl` before relying on a filter.

## Quick command reference

```bash
# Start a new change
git checkout main && git pull origin main
git checkout -b fix/<scope>-<short-name>

# After making changes
npm run typecheck    # must pass
npm run build        # must succeed

# Commit and push
git add <files>
git commit -m "fix(<scope>): <description>"
git push -u origin fix/<scope>-<short-name>
# Then open a PR via the GitHub URL printed by `git push`
```

## Open questions or proposals

For larger design decisions (e.g. "should new tools default to the v2 API?"), open a GitHub issue with the prefix `RFC:` rather than a PR. Discuss there, reach a conclusion, then implement.
