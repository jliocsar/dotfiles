# Effect v4 AI

Core abstractions live in `effect/unstable/ai`; providers are separate `@effect/ai-*` packages.

- [Language Model](language-model.md): `LanguageModel.generateText`/`streamText`, response accessors, stream part filtering, provider-agnostic pattern.
- [Providers](providers.md): `@effect/ai-anthropic`/`-openai`/`-openrouter`/`-openai-compat`; `Provider.model(id)` as Layer, `captureRequirements`, `Client.layerConfig`.
- [Tools and Structured Output](tools-and-structured-output.md): `Tool.make`, `Toolkit.make`, `toLayer`, `toolChoice`, provider-defined tools, `generateObject`.
- [Embeddings and Chat](embeddings-and-chat.md): `EmbeddingModel.embed`/`embedMany`/`Dimensions`, `Chat` stateful sessions, agentic loop, `AiError` handling.
