# file-storage

Get started with Tigris file storage. Walks through CLI setup (bucket, access keys, environment) and the `@tigrisdata/storage` SDK for application code.

## What It Covers

- **CLI setup** — install CLI, authenticate, create bucket, create access key, assign key to bucket with Editor or ReadOnly role
- **SDK reference** — `put`, `get`, `remove`, `list`, `head`, `getPresignedUrl` with full signatures and examples
- **Client-side uploads** — browser-direct uploads via `handleClientUpload` + `@tigrisdata/storage/client`
- **React component** — drop-in `<Uploader>` from `@tigrisdata/react`
- **Common patterns** — avatar upload, API route file serving, server upload route
- **Critical rules** — what to always do and never do
- **Known issues** — access denied, missing keys, CORS failures, pagination

## Installation

**Claude Code:**

```bash
cp -r skills/file-storage ~/.claude/skills/
```

**claude.ai:**

Add `skills/file-storage` to project knowledge or paste `SKILL.md` contents into the conversation.

## Usage

This skill activates when you mention:

- "File storage", "store files", "upload file"
- "Tigris", "tigris CLI", "tigris bucket"
- "Client upload", "presigned URL"
- Setting up object storage for an app

## Example Prompts

```text
Set up Tigris storage for my Next.js app
```

```text
Upload user avatars to Tigris
```

```text
Add client-side file uploads with progress tracking
```

## License

MIT
