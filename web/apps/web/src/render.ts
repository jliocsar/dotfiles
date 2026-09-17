import type { Raw } from '@dotfiles/jsx'
import * as Effect from 'effect/Effect'
import * as HttpServerResponse from 'effect/unstable/http/HttpServerResponse'

export const respond = (markup: Raw, status: number) =>
  HttpServerResponse.text(markup.html, { contentType: 'text/html', status })

export const page = <Error_, Services>(element: Effect.Effect<Raw, Error_, Services>) =>
  Effect.map(element, (markup) => respond(markup, 200))
