---
name: lx
description: Use lx to fetch, cache, and search markdown documentation from `llms.txt` corpora. Activate when the user wants to pull docs from an `llms.txt` URL, query a local docs cache, run full-text or semantic search across cached docs, or expose the cache as an MCP server.
when_to_use: User mentions `lx`, `llms.txt`, asks to fetch/cache/search documentation locally, wants semantic search over docs, or asks to run an MCP doc server.
allowed-tools: Bash(lx *)
---

# lx

`lx` is a fast local CLI that fetches markdown from `llms.txt` corpora, caches it in SQLite, and exposes it through full-text search, semantic (vector) search, and an MCP stdio server.

## Subcommands at a glance

- `lx fetch <url>` — fetch and cache a markdown doc; if the URL is an `llms.txt`, also crawls and caches its linked docs.
- `lx list` — list cached documents (filter with `--source <url>`).
- `lx sources` — list crawled `llms.txt` sources.
- `lx search <query>` — full-text (FTS5) search across the cache.
- `lx vector <query>` — semantic search; requires `LX_EMBED_ENABLED=1` in the environment.
- `lx mcp` — run as an MCP stdio server so other tools (Claude Code, etc.) can query the cache.

## Always confirm flags with `--help`

Before running any subcommand, run:

```bash
lx --help
```

to see the current flags, defaults, and option syntax (e.g. `--ttl`, `--fresh`, `--range`, `--source`, `--limit`, `--top-k`, `--json`). The `--help` output is the source of truth — prefer it over guessing flag names.

## Notes

- Cache TTL defaults to 7 days; pass `--fresh` to bust cache for a single URL.
- Vector search is gated: it only works when invoked with `LX_EMBED_ENABLED=1 lx vector "query"`.
- `--json` on `search`/`vector` is the right choice when piping into other tools or parsing programmatically.
- For MCP integration, point the client at `lx mcp` as a stdio command.
