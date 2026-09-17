# Atom

Reference docs for Effect v4 reactive atoms. Core `Atom` lives in `effect/unstable/reactivity` (there is NO `@effect/atom` core package); framework bindings ship as `@effect/atom-react` (also `-solid`/`-vue`).

- [Atoms](atoms.md): core `Atom` module — `Atom.make` polymorphism, `AsyncResult` vs `effect/Result`, `family`, `fn`/`fnSync`, `runtime`, `keepAlive`/`setIdleTTL`, finalizers.
- [React](react.md): `@effect/atom-react` hooks, `AsyncResult` rendering, registry/scoping/SSR, anti-patterns.
