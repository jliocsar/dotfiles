const TEXT_ESCAPES = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
])

const ATTRIBUTE_ESCAPES = new Map([...TEXT_ESCAPES, ['"', '&quot;'], ["'", '&#39;']])

const TEXT_UNESCAPES = new Map([...TEXT_ESCAPES].map(([plain, entity]) => [entity, plain]))

const TEXT_PATTERN = /[&<>]/gu

const ESCAPED_PATTERN = /&(?:amp|lt|gt);/gu

const ATTRIBUTE_PATTERN = /[&<>"']/gu

export const escapeText = (value: string): string =>
  value.replace(TEXT_PATTERN, (character) => TEXT_ESCAPES.get(character) ?? character)

export const escapeAttribute = (value: string): string =>
  value.replace(ATTRIBUTE_PATTERN, (character) => ATTRIBUTE_ESCAPES.get(character) ?? character)

export const unescapeText = (value: string): string =>
  value.replace(ESCAPED_PATTERN, (entity) => TEXT_UNESCAPES.get(entity) ?? entity)
