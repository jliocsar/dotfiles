# @dotfiles/jsx

Server-side JSX that renders straight to an html string. No effects inside the
runtime; an element is a `Raw` wrapping finished markup.

## Wiring

```json
{ "jsx": "react-jsx", "jsxImportSource": "@dotfiles/jsx" }
```

## Markup components

A plain function returning JSX. Usable as a tag.

```tsx
export const EntryItem = (props: { readonly entry: Entry }) => (
  <li>
    <a href={`/e/${props.entry.slug}`}>{props.entry.title}</a>
  </li>
)
```

## Effectful components

An `Effect.fn` generator that yields services and returns JSX. Its error and
requirement types are inferred from what it yields, nothing to register.

```tsx
export const NoteDetail = Effect.fn('NoteDetail')(function* (props: { readonly slug: EntrySlug }) {
  const entries = yield* Entries
  const entry = yield* entries.bySlug(props.slug)

  return <article>{entry.title}</article>
})
// Effect<Raw, EntryNotFound, Entries>
```

Effectful components can't be tags, because a tag has to produce markup
synchronously. Yield them and drop the result in as a child:

```tsx
export const EntryPage = Effect.fn('EntryPage')(function* (props: { readonly slug: EntrySlug }) {
  const detail = yield* NoteDetail({ slug: props.slug })

  return <Layout title={props.slug}>{detail}</Layout>
})
```

Lists of them go through `Effect.forEach`; pick concurrency there.

## What the runtime does

`<tag {...attrs}>children</tag>` escapes text children, serialises attributes
(`className` → `class`, `true` → bare attribute, `null`/`undefined`/`false`
dropped) and returns a `Raw`. Wrap trusted markup in `raw(html)`.

`render(node)` turns any `Node` (Raw, text, number, array) into a string; it's
what the factory uses for children and what you'd use to serialise by hand.

## Responding

```ts
const respond = (markup: Raw, status: number) =>
  HttpServerResponse.text(markup.html, { contentType: 'text/html', status })
```
