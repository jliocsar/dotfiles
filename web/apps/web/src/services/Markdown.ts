import { escapeAttribute, escapeText, unescapeText } from '@dotfiles/jsx/escape'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import bash from 'shiki/langs/bash.mjs'
import css from 'shiki/langs/css.mjs'
import html from 'shiki/langs/html.mjs'
import json from 'shiki/langs/json.mjs'
import markdown from 'shiki/langs/markdown.mjs'
import python from 'shiki/langs/python.mjs'
import sql from 'shiki/langs/sql.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import darkTheme from 'shiki/themes/github-dark-default.mjs'
import lightTheme from 'shiki/themes/github-light-default.mjs'

import { Entries } from './Entries.ts'

export interface MarkdownShape {
  readonly render: (body: string) => Effect.Effect<string>
}

const PARSER_OPTIONS = { autolinks: true } as const

const SAFE_HREF = /^(?:https?:\/\/|mailto:|\/|#)/u

const TASK_PLACEHOLDER = /<li data-task="">/gu

const INTERNAL_HREF = /^@([\w-]+)$/u

const INTERNAL_LINK = /<a href="\/e\/([\w-]+)" data-ref>/gu

const internalSlug = (href: string) => Option.fromUndefinedOr(INTERNAL_HREF.exec(href)?.[1])

const safeHref = (href: string) => {
  const resolved = href.startsWith('@') ? `/e/${href.slice(1)}` : href

  return SAFE_HREF.test(resolved) ? escapeAttribute(resolved) : '#'
}

const taskItem = (children: string, checked: boolean) =>
  `<li data-task=""><input type="checkbox" disabled${checked ? ' checked' : ''}>${children}</li>`

const numberTasks = (markup: string) => {
  let next = 0

  return markup.replace(TASK_PLACEHOLDER, () => `<li data-task="${next++}">`)
}

const internalSlugs = (markup: string) =>
  Array.from(markup.matchAll(INTERNAL_LINK), (match) => match[1] ?? '')

const markMissing = (markup: string, found: ReadonlySet<string>) =>
  markup.replace(INTERNAL_LINK, (tag, slug: string) =>
    found.has(slug) ? tag : tag.replace('data-ref', 'data-ref data-missing'),
  )

export class Markdown extends Context.Service<Markdown, MarkdownShape>()('app/Markdown', {
  make: Effect.gen(function* () {
    const entries = yield* Entries
    const highlighter = yield* Effect.promise(() =>
      createHighlighterCore({
        engine: createJavaScriptRegexEngine(),
        themes: [lightTheme, darkTheme],
        langs: [typescript, json, bash, sql, html, css, markdown, python],
      }),
    )

    const languages = new Set(highlighter.getLoadedLanguages())

    const codeBlock = (children: string, language: string | undefined) => {
      const source = unescapeText(children)

      return languages.has(language ?? '')
        ? highlighter.codeToHtml(source, {
            lang: language ?? '',
            themes: { light: lightTheme.name, dark: darkTheme.name },
            defaultColor: 'light-dark()',
          })
        : `<pre><code>${children}</code></pre>`
    }

    const link = (children: string, href: string) =>
      Option.match(internalSlug(href), {
        onNone: () => `<a href="${safeHref(href)}">${children}</a>`,
        onSome: (slug) => `<a href="/e/${slug}" data-ref>${children}</a>`,
      })

    const render = Effect.fn('Markdown.render')(function* (body: string) {
      const markup = numberTasks(
        Bun.markdown.render(body, {
          ...PARSER_OPTIONS,
          text: escapeText,
          html: escapeText,
          heading: (children, meta) => `<h${meta.level}>${children}</h${meta.level}>`,
          paragraph: (children) => `<p>${children}</p>`,
          blockquote: (children) => `<blockquote>${children}</blockquote>`,
          code: (children, meta) => codeBlock(children, meta?.language),
          codespan: (children) => `<code>${children}</code>`,
          list: (children, meta) =>
            meta.ordered
              ? `<ol start="${meta.start ?? 1}">${children}</ol>`
              : `<ul>${children}</ul>`,
          listItem: (children, meta) =>
            meta.checked === undefined ? `<li>${children}</li>` : taskItem(children, meta.checked),
          hr: () => '<hr>',
          table: (children) => `<table>${children}</table>`,
          thead: (children) => `<thead>${children}</thead>`,
          tbody: (children) => `<tbody>${children}</tbody>`,
          tr: (children) => `<tr>${children}</tr>`,
          th: (children) => `<th>${children}</th>`,
          td: (children) => `<td>${children}</td>`,
          strong: (children) => `<strong>${children}</strong>`,
          emphasis: (children) => `<em>${children}</em>`,
          strikethrough: (children) => `<del>${children}</del>`,
          link: (children, meta) => link(children, meta.href),
          image: (children, meta) =>
            `<img src="${safeHref(meta.src)}" alt="${escapeAttribute(children)}">`,
        }),
      )
      const found = yield* entries.existing(internalSlugs(markup))

      return markMissing(markup, found)
    })

    return { render } satisfies MarkdownShape
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make)
}
