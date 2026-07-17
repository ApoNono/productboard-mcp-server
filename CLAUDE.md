# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Before making any change, also read [`CONTRIBUTING.md`](./CONTRIBUTING.md)** in the repo root. It documents the branch naming, commit message format, and PR conventions this project uses. Following them keeps contributions reviewable and merge-friendly.

## Working in this repo (Claude Code-specific guidance)

`ApoNono/productboard-mcp-server` is a standalone Productboard **v2** MCP server maintained by a small team that values consistent, reviewable contributions. When Claude Code is invoked to make changes here, follow these guardrails in addition to CONTRIBUTING.md:

### Before changing code

1. **Sync `main` first.** Run `git checkout main && git pull origin main` before creating a topic branch. A stale base is the most common source of merge friction.
2. **Read recent commits** (`git log --oneline -10`) to learn the project's tone and recent direction.
3. **For any Productboard API change, verify the endpoint with a real curl** before writing code. Productboard silently ignores unknown query parameters and uses **camelCase** (`pageLimit`, `createdFrom`, `featureId`) — wrong param names produce no error, just empty results. Don't trust priors; confirm with the API.
   ```bash
   set -a && source .env && set +a
   curl -sS -H "Authorization: Bearer $PRODUCTBOARD_API_TOKEN" \
        -H "X-Version: 1" "$PRODUCTBOARD_API_BASE_URL/<path>"
   ```

### Branching and committing

- **Branch names**: `fix/<scope>-<short>`, `feat/<scope>`, `docs/<short>`, `chore/<short>`. Always use the slash separator. Never push to `main`.
- **Commit messages**: conventional-commits format — `fix(scope): description`, `feat(scope): description`. Include a "Verified end-to-end" section in the body listing what you actually tested vs what's speculative.
- **AI assistance**: include `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` (or your model version) at the end of the commit body.
- **Breaking changes**: if you remove or rename a tool input parameter, change a tool's permission requirements, or alter user-visible behavior, write `BREAKING:` followed by the impact in the commit body. Tool input schemas are public API.

### One PR = one logical change

If you can't summarize the PR in one sentence, split it. Drive-by fixes you stumble across belong in a separate PR. Bundling unrelated changes makes review and revert painful.

### Verification expectations

- Run `npm run typecheck` and `npm run build` and confirm both pass before pushing.
- For new tools or modified tool behavior: spawn the server (`node dist/index.js` via stdio) and exercise the tool. List the tools/calls you verified in the commit body's "Verified" section.
- Write-side tools that would create real data in the Productboard workspace can be left unverified — say so explicitly: `Not verified (would create real data): pb_X_create`.

### Tool registration checklist (when adding a new tool)

When adding a new tool, four files must change. If you forget one, the tool won't appear in `tools/list`:

1. **Tool file** in `src/tools/<resource>/<name>.ts` extending `BaseTool`
2. **Module index** at `src/tools/<resource>/index.ts` exporting the tool class
3. **Top-level index** at `src/tools/index.ts` re-exporting the module
4. **Permissions**:
   - If using an existing permission (e.g. `NOTES_READ`), no change needed
   - If adding a new resource, add `<RESOURCE>_READ/WRITE/DELETE` to `src/auth/permissions.ts` AND grant them in `PermissionDiscoveryService.grantFullPermissions()` in `src/auth/permission-discovery.ts`. Bearer-auth users won't see the tool otherwise.

### Don't change without confirming

- Don't rename existing tools or their input parameters without flagging as a breaking change and discussing with the maintainer
- All Productboard calls target the **v2 API** (`/v2/...`). The v1 REST API is retired (returns `410 Gone`) — never reintroduce a v1 endpoint. Verify any new endpoint with a real curl before writing code.
- Don't bump version tags or update `CHANGELOG.md` — release tagging is the maintainer's responsibility

## Development Commands

### Build and Start
- `npm run build` - Compile TypeScript to JavaScript and fix import paths
- `npm run dev` - Start development server with hot reload using tsx
- `npm start` - Run the compiled server from dist/

### Testing
- `npm test` - Run all tests with Jest
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report (95% threshold required)
- Single test: `npm test -- tests/unit/path/to/specific.test.ts`

### Code Quality
- `npm run lint` - Run ESLint on TypeScript files
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run typecheck` - Type check without emitting files
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check formatting without modifying files

## Architecture Overview

This is a **Model Context Protocol (MCP) server** that provides comprehensive integration with the Productboard API through 49 specialized tools. The architecture follows a modular, permission-based design:

### Core Components

- **`src/core/server.ts`** - Main MCP server implementation using `@modelcontextprotocol/sdk`
- **`src/auth/manager.ts`** - Authentication manager supporting Bearer tokens and OAuth2
- **`src/auth/permission-discovery.ts`** - Dynamically discovers user permissions and registers tools accordingly
- **`src/tools/base.ts`** - Abstract base class for all tools with permission checking
- **`src/api/client.ts`** - Productboard API client with rate limiting and retry logic

### Tool Registration System

Tools are automatically discovered and registered based on user permissions:
1. Server imports all tools from `@tools/index.js`
2. Permission discovery service determines user's Productboard access level
3. Only tools matching user permissions are registered
4. Tools extend `BaseTool` and implement permission metadata

### Directory Structure

- `src/core/` - MCP server core functionality and protocol handling
- `src/auth/` - Authentication, permissions, and credential management
- `src/api/` - Productboard API client and error handling
- `src/tools/` - 49 MCP tools organized by category (features, products, notes, etc.)
- `src/middleware/` - Rate limiting, caching, and validation
- `src/utils/` - Configuration, logging, and error utilities

### Key Patterns

- **Permission-based tool access** - Tools define required permissions and access levels
- **Path aliases** - Use `@auth/`, `@api/`, `@core/`, `@tools/`, `@middleware/`, `@utils/` imports
- **ESM modules** - Full ES modules with `.js` extensions in imports
- **Comprehensive error handling** - Custom error types for different failure modes
- **Structured logging** - Uses Pino logger with configurable levels

### Testing Architecture

- **Unit tests** - `tests/unit/` with extensive mocking and 95% coverage requirement
- **Integration tests** - `tests/integration/` for tool registration and API interactions  
- **E2E tests** - `tests/e2e/` for full MCP protocol testing
- **Test utilities** - `tests/helpers/test-utils.ts` provides common mocking helpers

### Configuration

- Environment-based configuration via `.env` file
- JSON schema validation in `config/schema.json`
- Support for both Bearer token and OAuth2 authentication
- **OAuth2 scope configuration** via `PRODUCTBOARD_OAUTH_SCOPES` environment variable
- Configurable rate limiting, caching, and logging levels

## Important Implementation Notes

- All imports use `.js` extensions even for TypeScript files (ESM requirement)
- Tools are filtered by user permissions - some may not be available with limited access
- The server validates Productboard API connection and credentials on startup
- Rate limiting prevents API abuse with configurable per-tool limits
- Caching improves performance for read operations
- OAuth2 tokens are automatically refreshed when expired

## OAuth2 Scope Configuration

Tools are registered based on OAuth2 scopes requested during authorization:

- **Configure scopes** in `.env`: `PRODUCTBOARD_OAUTH_SCOPES=users:read product_hierarchy_data:read notes:create`
- **Run OAuth2 setup**: `npm run oauth2:setup` 
- **Server registers tools** matching available permissions
- **See oauth2-config.yml** for complete scope definitions and role descriptions

**Important**: Scopes must match between your Productboard OAuth2 application and your `.env` configuration.