---
name: nidus
description: Remote AI agents.
when_to_use: "Asked to manage remote agents (pods) or create a routine."
---

Nidus is deployed in Fly.io. Manage remote agents that run in [Sprites](https://fly.io/sprites/).

Use `executor` to interact with Nidus' API.

OpenAPI spec: https://nidus.fly.dev/api/openapi.json — fetch it (no auth needed) to get request body shapes. Executor doesn't expose them, and Nidus' 400s come back with an empty body through executor.

Gotcha: `createEnvironment` takes `{ body: {...} }`, and every field is required. `variables` items are `{ kind: "set", name, value }` (or `{ kind: "kept", name }`), not plain strings, even though GET returns plain names.

When spawning new pods, output name of the pod once it's spawned and ready in a copy-to-paste format as in: `ssh {pod_name}`.
