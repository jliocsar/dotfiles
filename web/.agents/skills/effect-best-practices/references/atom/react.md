# Atom React

```ts
import {
  RegistryProvider,
  RegistryContext,
  useAtom,
  useAtomValue,
  useAtomSet,
  useAtomMount,
  useAtomRefresh,
  useAtomSuspense,
  useAtomSubscribe,
  useAtomInitialValues,
  useAtomRef,
  useAtomRefProp,
  useAtomRefPropValue,
  HydrationBoundary,
} from '@effect/atom-react'
import * as ScopedAtom from '@effect/atom-react/ScopedAtom'
import { AsyncResult } from 'effect/unstable/reactivity'
```

`useAtomValue(effectfulAtom)` returns an `AsyncResult`. `useAtomSuspense` returns `AsyncResult.Success`.

## Hooks — exact signatures

```ts
useAtomValue<A>(atom: Atom<A>): A
useAtomValue<A, B>(atom: Atom<A>, f: (_: A) => B): B          // selector mapped via Atom.map (memoized)

useAtom<R, W, Mode = never>(atom: Writable<R, W>, options?: { mode? }):
  readonly [value: R, write: (value: W | ((value: R) => W)) => void]   // value mode
  // mode "promise"  => write returns Promise<Success>
  // mode "promiseExit" => write returns Promise<Exit<Success, Failure>>

useAtomSet<R, W, Mode = never>(atom: Writable<R, W>, options?: { mode? }):
  (value: W | ((value: R) => W)) => void     // mounts atom, no subscription (no re-render on value change)

useAtomMount<A>(atom: Atom<A>): void          // keep mounted for component lifetime; cleaned up on unmount
useAtomRefresh<A>(atom: Atom<A>): () => void  // mounts + returns refresh callback

useAtomSuspense<A, E, IncludeFailure = false>(
  atom: Atom<AsyncResult<A, E>>,
  options?: { suspendOnWaiting?: boolean; includeFailure?: IncludeFailure }
): AsyncResult.Success<A,E> | (IncludeFailure extends true ? AsyncResult.Failure<A,E> : never)
  // throws a promise while Initial (or waiting if suspendOnWaiting); throws Cause.squash(cause) on Failure
  // unless includeFailure:true. suspendOnWaiting defaults to FALSE.

useAtomSubscribe<A>(atom: Atom<A>, f: (_: A) => void, options?: { immediate?: boolean }): void
useAtomInitialValues(initialValues: Iterable<readonly [Atom<any>, any]>): void  // seed once per registry

// AtomRef hooks (for AtomRef.ReadonlyRef / AtomRef.AtomRef, not registry atoms):
useAtomRef<A>(ref): A
useAtomRefProp<A, K>(ref, prop): AtomRef<A[K]>      // memoized ref.prop(prop)
useAtomRefPropValue<A, K>(ref, prop): A[K]
```

- DO use `useAtomSet` (not `useAtom`) when you only write and don't render the value — avoids re-renders.
- `useAtomValue`/`useAtom` use `React.useSyncExternalStore` (SSR-safe via `Atom.getServerValue`). Hooks read from the current `RegistryContext`.
- DON'T rely on `useAtomValue(atom, selector)` with an inline selector whose identity changes each render unless memoized (keyed on `[atom, f]`).
- DON'T forget `suspendOnWaiting` defaults to `false` — `useAtomSuspense` only suspends on `Initial`, not on refetch/waiting.
- DO wrap an error boundary around `useAtomSuspense` (failures throw `Cause.squash(cause)` unless `includeFailure`).

## AsyncResult rendering

Fluent builder (type-checked exhaustiveness):

```tsx
const result = useAtomValue(userAtom)
return AsyncResult.builder(result)
  .onInitial(() => <Spinner />) // also .onInitialOrWaiting / .onWaiting
  .onSuccess((user) => <Profile user={user} />)
  .onError((err) => <Err msg={err} />) // typed errors
  .onErrorTag(['NotFoundError'], (e) => <NotFound resource={e.resource} />) // by _tag
  .onDefect((d) => <Crash d={d} />) // non-error causes
  .onInterrupt(() => <Cancelled />)
  .orElse(() => null) // or .render() / .exhaustive() once all cases covered
```

- `.exhaustive()` is only available at the type level once every case is handled; otherwise use `.orElse`/`.orNull`/`.render`.
- Non-fluent matchers: `AsyncResult.match({onInitial,onFailure,onSuccess})`, `matchWithError({onInitial,onError,onDefect,onSuccess})`, `matchWithWaiting({onWaiting,onError,onDefect,onSuccess})`.
- Refinements/getters: `isInitial`, `isSuccess`, `isFailure`, `isInterrupted`, `value` (→Option), `getOrElse`, `getOrThrow`, `cause`, `error`.

## Registry / scoping / SSR

### RegistryProvider

```tsx
<RegistryProvider
  initialValues={[Atom.initialValue(myAtom, seed)]} // only applied at registry creation
  scheduleTask={fn}
  timeoutResolution={n}
  defaultIdleTTL={400}
>
  {children}
</RegistryProvider>
```

- Each provider owns one independent `AtomRegistry` (created via `AtomRegistry.make`), stable across renders.
- Default context registry exists if no provider (`defaultIdleTTL: 400`). On unmount, disposal is delayed ~500ms and **canceled if the provider remounts** (StrictMode / fast-refresh friendly).
- DON'T expect option changes after first render to rebuild the registry — they don't.

### ScopedAtom — per-subtree atom instances

```tsx
const Counter = ScopedAtom.make(() => Atom.make(0))               // no input
const User = ScopedAtom.make((name: string) => Atom.make(name))   // with provider `value` input
function View() { const atom = Counter.use(); const v = useAtomValue(atom); ... }
<Counter.Provider>...</Counter.Provider>
<User.Provider value="Ada">...</User.Provider>
```

- `use()` throws if called outside its `Provider`. Atom is created **once per provider lifetime** — changing the `value` prop after mount does NOT recreate the atom.

### SSR Hydration

```tsx
<HydrationBoundary state={dehydratedAtoms}>{children}</HydrationBoundary>
```

- New atoms hydrated during render (children see immediately); atoms already in registry are queued to a `useEffect` (post-commit) so transitions don't clobber current UI. `Hydration.hydrate` is idempotent.
- Produce state with `Hydration.dehydrate`; mark atoms serializable with `Atom.serializable`/`Atom.withServerValue` (server value used by `useSyncExternalStore`'s `getServerSnapshot`).
- DO seed SSR/test state via `RegistryProvider initialValues` / `Atom.initialValue` / `HydrationBoundary`.

## Anti-patterns

- DON'T call `Atom.make`/`Atom.fn`/`Atom.family(...)` inside a component body — new instance every render → lost state, leaks. (`useMemo` is NOT the fix; hoist to module scope or use `ScopedAtom`.)
- DON'T confuse `effect/Result` (sync Either-like) with `AsyncResult` (atom async state). React atoms use `AsyncResult`.
- DON'T forget `keepAlive` for atoms whose state must survive unmount — non-keepAlive atoms are disposed after `idleTTL`.
- DON'T mutate atom values imperatively in render; write via the setter from `useAtom`/`useAtomSet`, or `Atom.set` in an Effect.
