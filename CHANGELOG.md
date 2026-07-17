# Changelog

This project is a Model Context Protocol server for the Productboard **v2 REST API**, maintained by the Unifyr product team. It began as a fork of `miguelarios/productboard-mcp-server` and became a standalone project at **v2.0.0**, once Productboard retired the v1 API and the codebase had fully migrated to v2.

## v2.0.0 — Standalone, v2-native

- **Detached from the upstream fork.** This is now an independent project; it no longer tracks `miguelarios/productboard-mcp-server`.
- **Full v2 API migration.** Productboard retired the v1 REST API (all v1 endpoints now return `410 Gone`). Every tool and resource targets v2 endpoints. Bearer-token validation now checks a v2 endpoint at startup.
- **Behavior note:** `pb_feature_create` does not accept `status` or `priority` — set them via `pb_feature_update` after creation (the v2 `/entities` model sets them through a separate update).

## Pre-standalone history (as a fork)

- **Notes filtering & search** — `pb_note_list` filters and `pb_search_notes` were fixed to use correct Productboard parameter names/endpoints.
- **Product hierarchy** — `pb_product_hierarchy` assembles the tree client-side rather than calling a non-existent endpoint.
- **Initiatives** — added the `pb_initiative_*` tool family (list, get, create, update, link features, link objectives).
- **Teams & note processing** — added `pb_team_list` and `pb_note_process`.
- **Note editing** — added `pb_note_update`.
- **Releases** — `pb_release_list` and `pb_release_timeline` rebuilt; added `pb_release_group_list`.
- **Env loading** — `.env` loads relative to the compiled entry point, so no shell wrapper is needed in MCP client configs.
- **Infrastructure fixes** — cache miss handling, MCP stdio log routing, bearer-auth logging hygiene.

For commit-level detail, see the git history and tags.
